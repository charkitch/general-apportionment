#!/usr/bin/env python3
"""
Create a combined dataset for the spending lifecycle visualization
that properly matches USAspending data to apportionment data.
Version 2: Aggregates USAspending data across all reporting years.
"""

import pandas as pd
import json
import glob
from datetime import datetime
from collections import defaultdict

def create_spending_lifecycle_data():
    """Create combined dataset with proper matching and aggregation"""
    
    print("Loading apportionment data...")
    apportionment_df = pd.read_csv('processed_data/appropriations/dhs_tas_aggregated_with_fund_types.csv')
    print(f"  Loaded {len(apportionment_df)} apportionment records")
    
    # Create a lookup for apportionment data by TAS + availability period
    apportionment_lookup = {}
    for _, row in apportionment_df.iterrows():
        tas = row['tas']
        period = row['availability_period']
        key = f"{tas}|{period}"
        if key not in apportionment_lookup:
            apportionment_lookup[key] = []
        apportionment_lookup[key].append(row.to_dict())
    
    print("\nFinding USAspending files...")
    pattern = 'raw_data/usaspending/FY*/FY*_All_TAS_AccountBalances*.csv'
    files = glob.glob(pattern)
    print(f"Found {len(files)} USAspending files")
    
    # First pass: collect all USAspending data by TAS + period
    usaspending_by_key = defaultdict(lambda: {
        'budget_authority': 0,
        'obligations': 0,
        'outlays': 0,
        'unobligated_balance': 0,
        'treasury_account_names': set(),
        'reporting_years': set()
    })
    
    for filepath in sorted(files):
        print(f"\nProcessing: {filepath}")
        
        # Extract reporting fiscal year from filename
        fy_match = filepath.split('/')[-1][:6]
        reporting_fy = int(fy_match[2:]) if fy_match.startswith('FY') else None
        
        df = pd.read_csv(filepath)
        print(f"  Loaded {len(df)} records")
        
        for _, row in df.iterrows():
            # Construct the full TAS to match apportionment format
            agency = str(row.get('agency_identifier_code', '')).zfill(3)
            begin_year = row.get('beginning_period_of_availability')
            end_year = row.get('ending_period_of_availability')
            main_account = str(row.get('main_account_code', '')).zfill(4)
            sub_account = str(row.get('sub_account_code', '')).zfill(3)
            
            # Skip if missing key components
            if pd.isna(begin_year) or not agency or not main_account:
                continue
            
            # Construct TAS based on availability type
            if pd.isna(end_year) or begin_year == end_year:
                # Annual or no-year fund
                availability_period = f"{int(begin_year)}/{int(begin_year)}"
            else:
                # Multi-year fund
                availability_period = f"{int(begin_year)}/{int(end_year)}"
            
            tas_simple = f"{agency}-{main_account}"
            lookup_key = f"{tas_simple}|{availability_period}"
            
            # Aggregate USAspending data
            usa_data = usaspending_by_key[lookup_key]
            usa_data['budget_authority'] += float(row.get('budget_authority_appropriated_amount', 0) or 0)
            usa_data['obligations'] += float(row.get('obligations_incurred', 0) or 0)
            usa_data['outlays'] += float(row.get('gross_outlay_amount', 0) or 0)
            usa_data['unobligated_balance'] = float(row.get('unobligated_balance', 0) or 0)  # Use latest value
            
            account_name = row.get('treasury_account_name', '')
            if account_name:
                usa_data['treasury_account_names'].add(account_name)
            if reporting_fy:
                usa_data['reporting_years'].add(reporting_fy)
    
    print(f"\n=== Aggregation Complete ===")
    print(f"Unique TAS/period combinations with USAspending data: {len(usaspending_by_key)}")
    
    # Second pass: create combined records
    all_records = []
    matched_keys = set()
    
    for key, usa_data in usaspending_by_key.items():
        # Look up apportionment data
        apportionment_matches = apportionment_lookup.get(key, [])
        
        if apportionment_matches:
            # We have matching apportionment data
            for app_data in apportionment_matches:
                tas_simple, availability_period = key.split('|')
                
                # Parse period years
                begin_year, end_year = availability_period.split('/')
                begin_year = int(begin_year)
                end_year = int(end_year)
                
                record = {
                    # Identifiers
                    'tas': tas_simple,
                    'tas_simple': tas_simple,
                    'agency': tas_simple.split('-')[0],
                    'account': tas_simple.split('-')[1],
                    'availability_period': availability_period,
                    'begin_year': begin_year,
                    'end_year': end_year,
                    'reporting_years': list(usa_data['reporting_years']),
                    
                    # From apportionment
                    'bureau': app_data['bureau'],
                    'account_name': app_data['account'],
                    'availability_type': app_data['availability_type'],
                    'fund_type': app_data['fund_type'],
                    'budget_category': app_data['budget_category'],
                    'apportionment_amount': app_data['amount'],
                    'apportionment_fy': app_data['fiscal_year'],
                    
                    # From USAspending (aggregated)
                    'treasury_account_names': list(usa_data['treasury_account_names']),
                    'budget_authority': round(usa_data['budget_authority'], 2),
                    'obligations': round(usa_data['obligations'], 2),
                    'outlays': round(usa_data['outlays'], 2),
                    'unobligated_balance': round(usa_data['unobligated_balance'], 2),
                }
                
                all_records.append(record)
                matched_keys.add(key)
    
    # Report unmatched USAspending data
    unmatched_keys = set(usaspending_by_key.keys()) - matched_keys
    print(f"\nMatched: {len(matched_keys)} TAS/period combinations")
    print(f"Unmatched: {len(unmatched_keys)} TAS/period combinations")
    
    if unmatched_keys:
        print("\nSample unmatched TAS/periods:")
        for key in list(unmatched_keys)[:10]:
            print(f"  {key.replace('|', ' ')}")
    
    # Save the combined data
    output_data = {
        'metadata': {
            'created': datetime.now().isoformat(),
            'total_records': len(all_records),
            'matched_combinations': len(matched_keys),
            'unmatched_combinations': len(unmatched_keys)
        },
        'records': all_records
    }
    
    # Create directory if needed
    import os
    os.makedirs('processed_data/spending_lifecycle', exist_ok=True)
    
    output_file = 'processed_data/spending_lifecycle/spending_lifecycle_data.json'
    with open(output_file, 'w') as f:
        json.dump(output_data, f, indent=2)
    
    print(f"\nSaved to: {output_file}")
    
    # Also save as CSV for analysis
    csv_file = 'processed_data/spending_lifecycle/spending_lifecycle_data.csv'
    pd.DataFrame(all_records).to_csv(csv_file, index=False)
    print(f"Also saved CSV: {csv_file}")
    
    # Print summary statistics
    df_records = pd.DataFrame(all_records)
    
    print("\n=== Summary by Fiscal Year and Availability Type ===")
    for fy in sorted(df_records['apportionment_fy'].unique()):
        print(f"\nFY{fy}:")
        fy_data = df_records[df_records['apportionment_fy'] == fy]
        
        for avail_type in ['annual', 'multi-year', 'no-year']:
            subset = fy_data[fy_data['availability_type'] == avail_type]
            if len(subset) > 0:
                total_app = subset['apportionment_amount'].sum()
                total_oblig = subset['obligations'].sum()
                total_outlay = subset['outlays'].sum()
                oblig_rate = (total_oblig/total_app*100) if total_app > 0 else 0
                
                print(f"  {avail_type.upper()}: {len(subset)} records")
                print(f"    Apportionment: ${total_app/1e9:.2f}B")
                print(f"    Obligations: ${total_oblig/1e9:.2f}B ({oblig_rate:.1f}%)")

if __name__ == "__main__":
    create_spending_lifecycle_data()