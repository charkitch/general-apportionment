import requests
import json
import pandas as pd
import time
import argparse
from datetime import datetime
from tqdm import tqdm
import os

def fetch_file_data(file_id):
    """Fetch a single file's data from the API"""
    try:
        url = f"https://openomb.org/api/v1/files/{file_id}"
        response = requests.get(url, params={"sourceData": "true"})
        
        if response.status_code == 200:
            data = response.json()
            return data.get('results', {})
        else:
            print(f"Error fetching file {file_id}: Status {response.status_code}")
            return None
    except Exception as e:
        print(f"Error fetching file {file_id}: {e}")
        return None

def parse_schedule_data(file_info):
    """Parse the schedule data from a file into structured format"""
    schedule_lines = []
    
    if not file_info or not file_info.get('sourceData'):
        return schedule_lines
    
    try:
        source_data = json.loads(file_info['sourceData'])
        
        if 'ScheduleData' in source_data:
            for line in source_data['ScheduleData']:
                # Extract TAS components
                cgac_agency = line.get('CgacAgency', '')
                cgac_acct = line.get('CgacAcct', '')
                tas = f"{cgac_agency}-{cgac_acct}" if cgac_agency and cgac_acct else ""
                
                # Determine availability period (color of money)
                availability_type = line.get('AvailabilityTypeCode', '')
                begin_poa = line.get('BeginPoa', '')
                end_poa = line.get('EndPoa', '')
                
                if availability_type == 'X':
                    availability_period = 'X'  # No-year money
                elif begin_poa and end_poa:
                    availability_period = f"{begin_poa}/{end_poa}"
                else:
                    # Annual appropriation
                    availability_period = str(file_info.get('fiscalYear', ''))
                
                line_data = {
                    'file_id': file_info.get('fileId'),
                    'fiscal_year': file_info.get('fiscalYear'),
                    'bureau': line.get('BudgetBureauTitle'),
                    'account': line.get('AccountTitle'),
                    'tas': tas,
                    'availability_period': availability_period,
                    'line_number': line.get('LineNumber'),
                    'line_description': line.get('LineDescription'),
                    'amount': float(line.get('ApprovedAmount', 0)),
                    'iteration': line.get('Iteration'),
                    'approval_date': file_info.get('approvalTimestamp')
                }
                
                schedule_lines.append(line_data)
                
    except Exception as e:
        print(f"Error parsing file {file_info.get('fileId')}: {e}")
    
    return schedule_lines

def aggregate_by_tas_and_period(schedule_df):
    """Aggregate budget data by TAS and availability period"""
    
    # Key line 1920 is "Total budgetary resources available"
    # This is the main total for each TAS/period combination
    totals_df = schedule_df[schedule_df['line_number'] == '1920'].copy()
    
    if len(totals_df) == 0:
        # If no 1920 lines, try 6190 which is also a total
        totals_df = schedule_df[schedule_df['line_number'] == '6190'].copy()
    
    # Group by TAS, availability period, bureau, and account
    # Take the maximum amount for each group (handles iterations)
    aggregated = totals_df.groupby(
        ['tas', 'availability_period', 'bureau', 'account', 'fiscal_year']
    ).agg({
        'amount': 'max',  # Use max to get latest iteration
        'approval_date': 'max',  # Latest approval
        'iteration': 'max'  # Latest iteration number
    }).reset_index()
    
    # Sort by bureau, account, TAS, and availability period
    aggregated = aggregated.sort_values(['bureau', 'account', 'tas', 'availability_period'])
    
    return aggregated

def process_account(bureau, account, files_df):
    """Process a single account"""
    # Get files for this account
    account_files = files_df[
        (files_df['bureau'] == bureau) & 
        (files_df['account'] == account)
    ]
    
    all_schedule_data = []
    
    for _, file_row in tqdm(account_files.iterrows(), desc=f"{bureau[:20]} - {account[:20]}", total=len(account_files), leave=False):
        file_id = file_row['file_id']
        
        file_info = fetch_file_data(file_id)
        if file_info:
            schedule_data = parse_schedule_data(file_info)
            all_schedule_data.extend(schedule_data)
        
        time.sleep(0.2)  # Be nice to the API
    
    if all_schedule_data:
        schedule_df = pd.DataFrame(all_schedule_data)
        aggregated = aggregate_by_tas_and_period(schedule_df)
        return aggregated
    else:
        return pd.DataFrame()

def main():
    parser = argparse.ArgumentParser(description='Aggregate DHS budget data by TAS and availability period')
    parser.add_argument('--bureau', help='Specific bureau to process')
    parser.add_argument('--account', help='Specific account to process')
    parser.add_argument('--fy', help='Specific fiscal year (2022-2025)')
    parser.add_argument('--output', default='processed_data/appropriations/dhs_tas_aggregated.csv', help='Output filename')
    
    args = parser.parse_args()
    
    # Load the file metadata
    print("Loading DHS file metadata...")
    files_df = pd.read_csv('processed_data/appropriations/dhs_files_with_fy.csv')
    files_df['fiscal_year'] = files_df['fiscal_year'].astype(str)
    
    # Filter by fiscal year if specified
    if args.fy:
        files_df = files_df[files_df['fiscal_year'] == args.fy]
        print(f"Filtered to FY{args.fy}: {len(files_df)} files")
    
    # Process specific account or all accounts
    all_aggregated_data = []
    
    if args.bureau and args.account:
        # Process single account
        aggregated = process_account(args.bureau, args.account, files_df)
        if len(aggregated) > 0:
            all_aggregated_data.append(aggregated)
    else:
        # Process all accounts
        accounts = files_df.groupby(['bureau', 'account']).size().reset_index(name='file_count')
        print(f"\nProcessing {len(accounts)} accounts...")
        
        for _, account_row in tqdm(accounts.iterrows(), desc="Processing accounts", total=len(accounts)):
            aggregated = process_account(account_row['bureau'], account_row['account'], files_df)
            if len(aggregated) > 0:
                all_aggregated_data.append(aggregated)
    
    # Combine all results
    if all_aggregated_data:
        final_df = pd.concat(all_aggregated_data, ignore_index=True)
        
        # Add some useful calculated fields
        final_df['tas_full'] = final_df['tas'] + '-' + final_df['availability_period']
        final_df['amount_millions'] = final_df['amount'] / 1_000_000
        
        # Format approval date for readability
        final_df['approval_date_formatted'] = pd.to_datetime(final_df['approval_date']).dt.strftime('%Y-%m-%d')
        
        # Create output directory if needed
        output_dir = os.path.dirname(args.output)
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)
        
        # Save to CSV with metadata
        final_df.to_csv(args.output, index=False)
        
        # Save run metadata
        metadata = {
            'run_date': datetime.now().isoformat(),
            'parameters': {
                'bureau': args.bureau,
                'account': args.account,
                'fiscal_year': args.fy
            },
            'results': {
                'total_rows': len(final_df),
                'total_amount': float(final_df['amount'].sum()),
                'unique_tas': final_df['tas'].nunique(),
                'unique_tas_period': final_df['tas_full'].nunique()
            }
        }
        
        metadata_file = args.output.replace('.csv', '_metadata.json')
        with open(metadata_file, 'w') as f:
            json.dump(metadata, f, indent=2)
        print(f"\nSaved run metadata to {metadata_file}")
        print(f"\n=== Summary ===")
        print(f"Total rows: {len(final_df)}")
        print(f"Total amount: ${final_df['amount'].sum():,.0f}")
        print(f"Unique TAS codes: {final_df['tas'].nunique()}")
        print(f"Unique TAS-Period combinations: {final_df['tas_full'].nunique()}")
        print(f"\nSaved to {args.output}")
        
        # Show sample
        print("\n=== Sample Output ===")
        print(final_df[['bureau', 'account', 'tas', 'availability_period', 'amount_millions']].head(10).to_string())
    else:
        print("No data found!")

if __name__ == "__main__":
    main()