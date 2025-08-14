#!/usr/bin/env python3
"""
Aggregate USAspending data by appropriation fiscal year.
This is crucial because obligations and outlays from a FY2023 appropriation 
can occur in FY2023, FY2024, FY2025, etc.
"""

import pandas as pd
import json
import glob
import os
from datetime import datetime

def parse_tas_for_appropriation_year(tas_string):
    """Extract the appropriation fiscal year from a TAS string"""
    if not tas_string:
        return None
    
    # Format: 070-2024/2024-0112-000
    # The first year after the dash is the beginning period of availability
    parts = tas_string.split('-')
    if len(parts) >= 2 and '/' in parts[1]:
        year_part = parts[1].split('/')[0]
        try:
            return int(year_part)
        except:
            return None
    return None

def aggregate_usaspending_data():
    """Aggregate all USAspending data by appropriation fiscal year"""
    
    # Load TAS to availability type mapping
    tas_to_availability = load_apportionment_data()
    
    print("\nFinding USAspending files...")
    # Find all USAspending AccountBalances files
    pattern = 'raw_data/usaspending/FY*/FY*_All_TAS_AccountBalances*.csv'
    files = glob.glob(pattern)
    
    print(f"Found {len(files)} USAspending files")
    
    # Dictionary to store aggregated data by appropriation year
    data_by_appropriation_year = {}
    
    for filepath in sorted(files):
        print(f"\nProcessing: {filepath}")
        
        # Read the CSV
        df = pd.read_csv(filepath)
        print(f"  Loaded {len(df)} records")
        
        # Process each record
        for idx, row in df.iterrows():
            # Get the appropriation year from beginning_period_of_availability
            approp_year = row.get('beginning_period_of_availability')
            if pd.isna(approp_year):
                continue
                
            try:
                approp_year = int(approp_year)
            except:
                continue
            
            # Get the TAS components
            tas_full = row.get('treasury_account_symbol', '')
            agency = tas_full.split('-')[0] if '-' in tas_full else ''
            main_account = tas_full.split('-')[2].split('-')[0] if tas_full.count('-') >= 2 else ''
            tas_simple = f"{agency}-{main_account}" if agency and main_account else None
            
            if not tas_simple:
                continue
            
            # Initialize year data if needed
            if approp_year not in data_by_appropriation_year:
                data_by_appropriation_year[approp_year] = {}
            
            # Initialize TAS data if needed
            if tas_simple not in data_by_appropriation_year[approp_year]:
                data_by_appropriation_year[approp_year][tas_simple] = {
                    'tas': tas_simple,
                    'budget_authority': 0,
                    'obligations': 0,
                    'outlays': 0,
                    'treasury_account_names': set()
                }
            
            # Aggregate the amounts
            tas_data = data_by_appropriation_year[approp_year][tas_simple]
            tas_data['budget_authority'] += float(row.get('budget_authority_appropriated_amount', 0) or 0)
            tas_data['obligations'] += float(row.get('obligations_incurred', 0) or 0)
            tas_data['outlays'] += float(row.get('gross_outlay_amount', 0) or 0)
            
            # Track account names for component identification
            account_name = row.get('treasury_account_name', '')
            if account_name:
                tas_data['treasury_account_names'].add(account_name)
    
    # Convert to output format
    output_data = {}
    
    for year, year_data in data_by_appropriation_year.items():
        year_str = str(year)
        output_data[year_str] = []
        
        for tas, tas_data in year_data.items():
            # Determine component from treasury account names
            component = extract_component_from_names(tas_data['treasury_account_names'])
            
            # Get availability type from our mapping
            availability_type = tas_to_availability.get(tas, 'unknown')
            
            output_data[year_str].append({
                'tas': tas,
                'component': component,
                'availability_type': availability_type,
                'budget_authority': round(tas_data['budget_authority'], 2),
                'obligations': round(tas_data['obligations'], 2),
                'outlays': round(tas_data['outlays'], 2)
            })
    
    # Save the aggregated data
    output_file = 'processed_data/usaspending/usaspending_aggregated_by_appropriation_year.json'
    with open(output_file, 'w') as f:
        json.dump(output_data, f, indent=2)
    
    print(f"\n=== Aggregation Complete ===")
    print(f"Saved to: {output_file}")
    
    # Print summary
    for year, records in sorted(output_data.items()):
        total_obligations = sum(r['obligations'] for r in records)
        total_outlays = sum(r['outlays'] for r in records)
        print(f"\nFY{year}:")
        print(f"  Records: {len(records)}")
        print(f"  Total obligations: ${total_obligations:,.0f}")
        print(f"  Total outlays: ${total_outlays:,.0f}")
    
    # Also create a CSV version for easier inspection
    all_records = []
    for year, records in output_data.items():
        for record in records:
            record['fiscal_year'] = year
            all_records.append(record)
    
    csv_file = 'processed_data/usaspending/usaspending_aggregated_by_appropriation_year.csv'
    pd.DataFrame(all_records).to_csv(csv_file, index=False)
    print(f"\nAlso saved CSV: {csv_file}")

def load_apportionment_data():
    """Load apportionment data and create TAS to availability type mapping"""
    print("Loading apportionment data for availability type mapping...")
    apportionment_df = pd.read_csv('processed_data/appropriations/dhs_tas_aggregated_with_fund_types.csv')
    
    # Create mapping from simple TAS to availability type
    tas_to_availability = {}
    for _, row in apportionment_df.iterrows():
        # Extract simple TAS (e.g., 070-0115 from 070-0115-2021/2022)
        tas_full = row['tas']
        tas_simple = '-'.join(tas_full.split('-')[:2])
        
        # Store the availability type (using the first one we see for each TAS)
        if tas_simple not in tas_to_availability:
            tas_to_availability[tas_simple] = row['availability_type']
    
    print(f"  Created availability mapping for {len(tas_to_availability)} TAS codes")
    return tas_to_availability

def extract_component_from_names(account_names):
    """Extract component from a set of treasury account names"""
    # Component keywords mapping
    component_map = {
        'Customs and Border Protection': ['Customs and Border Protection', 'CBP'],
        'Immigration and Customs Enforcement': ['Immigration and Customs Enforcement', 'ICE'],
        'Transportation Security Administration': ['Transportation Security Administration', 'TSA'],
        'Coast Guard': ['Coast Guard', 'USCG'],
        'Secret Service': ['Secret Service', 'USSS'],
        'Federal Emergency Management Agency': ['Federal Emergency Management Agency', 'FEMA'],
        'Cybersecurity and Infrastructure Security Agency': ['Cybersecurity and Infrastructure Security Agency', 'CISA'],
        'Citizenship and Immigration Services': ['Citizenship and Immigration Services', 'USCIS'],
        'Science and Technology': ['Science and Technology'],
        'Management Directorate': ['Management Directorate'],
        'Federal Law Enforcement Training': ['Federal Law Enforcement Training'],
        'Inspector General': ['Inspector General'],
        'Countering Weapons of Mass Destruction': ['Countering Weapons of Mass Destruction', 'CWMD'],
        'Analysis and Operations': ['Analysis', 'Operations Coordination']
    }
    
    # Check each account name for component keywords
    for name in account_names:
        for component, keywords in component_map.items():
            for keyword in keywords:
                if keyword.lower() in name.lower():
                    return component
    
    # If no match, try to extract from comma-separated format
    for name in account_names:
        if ',' in name:
            parts = name.split(',')
            if len(parts) > 1:
                return parts[-2].strip()
    
    return "Unknown"

if __name__ == "__main__":
    aggregate_usaspending_data()