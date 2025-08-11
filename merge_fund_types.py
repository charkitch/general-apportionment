#!/usr/bin/env python3
"""
Merge FAST Book fund type information with DHS budget data
"""
import pandas as pd
import os

def merge_fund_types():
    """Merge fund type data from FAST Book with our TAS aggregated data"""
    
    # Check if FAST Book data exists
    fast_book_path = 'data/fast_book/dhs_tas_fund_type_mapping.csv'
    if not os.path.exists(fast_book_path):
        print("ERROR: FAST Book mapping not found!")
        print(f"Expected file: {fast_book_path}")
        print("\nPlease run: python download_fast_book.py")
        print("This only needs to be done once to download Treasury's FAST Book data.")
        return False
    
    # Load the DHS FAST Book mapping data (includes all formats)
    print("Loading FAST Book data...")
    fast_df = pd.read_csv(fast_book_path)
    
    # Create a mapping of TAS prefix to fund type
    # Extract the account number from TAS (e.g., "070 0530" -> "0530", "070X0530" -> "0530")
    # Handle both space-separated and X-separated formats
    def extract_account_code(tas):
        # TAS formats: "070 0530", "070X0530", "070X0530.001"
        # Remove the agency code (070) prefix
        if tas.startswith('070X'):
            account = tas[4:]  # Remove "070X"
        elif tas.startswith('070 '):
            account = tas[4:]  # Remove "070 "
        else:
            account = tas  # Shouldn't happen but be safe
        
        # Remove any sub-account suffixes like .001
        account = account.split('.')[0]
        
        return account.strip()
    
    fast_df['tas_account'] = fast_df['TAS'].apply(extract_account_code)
    
    # Create mapping dictionary
    tas_to_fund_type = {}
    for _, row in fast_df.iterrows():
        account = row['tas_account']
        fund_type = row['Fund Type']
        # Clean up fund type
        if pd.notna(fund_type):
            fund_type = fund_type.strip()
            if fund_type == '\tGeneral Fund':
                fund_type = 'General Funds'
        tas_to_fund_type[account] = fund_type
    
    print(f"Created mapping for {len(tas_to_fund_type)} account codes")
    
    # Load our aggregated budget data
    print("\nLoading budget data...")
    budget_df = pd.read_csv('data/dhs_tas_aggregated.csv')
    
    # Extract account code from TAS
    # TAS format is like "070-0530" or "070-0530-2023/2025"
    budget_df['tas_account'] = budget_df['tas'].str.split('-').str[1]
    
    # Map fund types
    budget_df['fund_type'] = budget_df['tas_account'].map(tas_to_fund_type)
    
    # Fill missing with "Unknown"
    budget_df['fund_type'] = budget_df['fund_type'].fillna('Unknown')
    
    # Add budget enforcement category based on fund type
    def get_budget_category(fund_type):
        if fund_type in ['General Funds', 'General Fund']:
            return 'Discretionary'  # Most general funds are discretionary
        elif fund_type in ['Trust Funds', 'Special Funds']:
            return 'Mandatory'  # Trust and special funds are typically mandatory
        elif fund_type == 'Revolving Funds':
            return 'Mandatory'  # Revolving funds are self-sustaining
        else:
            return 'Other'
    
    budget_df['budget_category'] = budget_df['fund_type'].apply(get_budget_category)
    
    # Save enhanced data
    output_file = 'data/dhs_tas_aggregated_with_fund_types.csv'
    budget_df.to_csv(output_file, index=False)
    print(f"\nSaved enhanced data to: {output_file}")
    
    # Print summary
    print("\n=== Fund Type Summary ===")
    fund_summary = budget_df.groupby('fund_type')['amount'].agg(['sum', 'count'])
    fund_summary['percent'] = (fund_summary['sum'] / fund_summary['sum'].sum() * 100).round(1)
    print(fund_summary)
    
    print("\n=== Budget Category Summary ===")
    cat_summary = budget_df.groupby('budget_category')['amount'].agg(['sum', 'count'])
    cat_summary['percent'] = (cat_summary['sum'] / cat_summary['sum'].sum() * 100).round(1)
    print(cat_summary)
    
    # By component and fund type
    print("\n=== Top Components by Fund Type ===")
    component_fund = budget_df.groupby(['bureau', 'fund_type'])['amount'].sum().reset_index()
    component_fund = component_fund.sort_values('amount', ascending=False).head(20)
    print(component_fund)
    
    # Generate flat data with fund types for visualization
    print("\n\nRegenerating flat data with fund types...")
    generate_flat_data_with_fund_types(budget_df)

def generate_flat_data_with_fund_types(df):
    """Generate the flat JSON file with fund type information"""
    
    # Create records for the flat file
    records = []
    for _, row in df.iterrows():
        record = {
            'tas': row['tas'],
            'tas_full': row['tas_full'],
            'fiscal_year': int(row['fiscal_year']),
            'availability_type': row['availability_type'] if 'availability_type' in row else 'unknown',
            'availability_period': row['availability_period'],
            'bureau': row['bureau'],
            'bureau_full': row['bureau'],
            'abbreviation': get_bureau_abbreviation(row['bureau']),
            'account': row['account'],
            'amount': float(row['amount']),
            'fund_type': row['fund_type'],
            'budget_category': row['budget_category']
        }
        records.append(record)
    
    # Sort by amount descending
    records.sort(key=lambda x: x['amount'], reverse=True)
    
    # Create output structure
    output = {
        'name': 'DHS Budget Data',
        'total_amount': float(df['amount'].sum()),
        'fiscal_years': sorted(df['fiscal_year'].unique().tolist()),
        'availability_types': sorted(df['availability_type'].unique().tolist()) if 'availability_type' in df else [],
        'fund_types': sorted(df['fund_type'].unique().tolist()),
        'budget_categories': sorted(df['budget_category'].unique().tolist()),
        'bureaus': sorted(df['bureau'].unique().tolist()),
        'bureau_abbreviations': get_all_bureau_abbreviations(),
        'record_count': len(records),
        'data': records
    }
    
    # Save to file
    import json
    output_file = 'data/dhs_budget_flat.json'
    with open(output_file, 'w') as f:
        json.dump(output, f, indent=2)
    
    print(f"Updated flat data file: {output_file}")

def get_bureau_abbreviation(bureau):
    """Get abbreviation for a bureau"""
    abbreviations = {
        'Analysis and Operations': 'A&O',
        'Citizenship and Immigration Services': 'USCIS',
        'Countering Weapons of Mass Destruction Office': 'CWMD',
        'Cybersecurity and Infrastructure Security Agency': 'CISA',
        'Federal Emergency Management Agency': 'FEMA',
        'Federal Law Enforcement Training Center': 'FLETC',
        'Federal Law Enforcement Training Centers': 'FLETC',
        'Management Directorate': 'MGMT',
        'Office of the Inspector General': 'OIG',
        'Office of the Secretary and Executive Management': 'OSEM',
        'Science and Technology': 'S&T',
        'Transportation Security Administration': 'TSA',
        'U.S. Customs and Border Protection': 'CBP',
        'U.S. Immigration and Customs Enforcement': 'ICE',
        'United States Coast Guard': 'USCG',
        'United States Secret Service': 'USSS'
    }
    return abbreviations.get(bureau, '')

def get_all_bureau_abbreviations():
    """Get all bureau abbreviations"""
    return {
        'Analysis and Operations': 'A&O',
        'Citizenship and Immigration Services': 'USCIS',
        'Countering Weapons of Mass Destruction Office': 'CWMD',
        'Cybersecurity and Infrastructure Security Agency': 'CISA',
        'Federal Emergency Management Agency': 'FEMA',
        'Federal Law Enforcement Training Center': 'FLETC',
        'Federal Law Enforcement Training Centers': 'FLETC',
        'Management Directorate': 'MGMT',
        'Office of the Inspector General': 'OIG',
        'Office of the Secretary and Executive Management': 'OSEM',
        'Science and Technology': 'S&T',
        'Transportation Security Administration': 'TSA',
        'U.S. Customs and Border Protection': 'CBP',
        'U.S. Immigration and Customs Enforcement': 'ICE',
        'United States Coast Guard': 'USCG',
        'United States Secret Service': 'USSS'
    }

if __name__ == "__main__":
    merge_fund_types()