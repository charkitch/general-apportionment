#!/usr/bin/env python3
"""
Generate a flat JSON file with all data at the finest granularity.
JavaScript will handle dynamic aggregation based on user selections.
"""
import pandas as pd
import json
import os

# Bureau abbreviations
BUREAU_ABBREVIATIONS = {
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

def load_data():
    """Load the aggregated TAS data"""
    df = pd.read_csv('processed_data/appropriations/dhs_tas_aggregated.csv')
    
    # Add availability type
    def get_availability_type(period):
        if period == 'X':
            return 'no-year'
        elif '/' in str(period):
            # Check if it's same year (e.g., "2022/2022" is annual)
            parts = str(period).split('/')
            if len(parts) == 2 and parts[0] == parts[1]:
                return 'annual'
            else:
                return 'multi-year'
        else:
            return 'annual'
    
    df['availability_type'] = df['availability_period'].apply(get_availability_type)
    
    return df

def generate_flat_data():
    """Generate flat data structure with all fields"""
    df = load_data()
    
    print("Generating flat data structure...")
    
    # Create records with all fields
    records = []
    for _, row in df.iterrows():
        record = {
            'tas': row['tas'],
            'tas_full': row['tas_full'],
            'fiscal_year': int(row['fiscal_year']),
            'availability_type': row['availability_type'],
            'availability_period': row['availability_period'],
            'bureau': row['bureau'],
            'bureau_full': row['bureau'],
            'abbreviation': BUREAU_ABBREVIATIONS.get(row['bureau'], ''),
            'account': row['account'],
            'amount': float(row['amount'])
        }
        records.append(record)
    
    # Sort by amount descending for better visualization
    records.sort(key=lambda x: x['amount'], reverse=True)
    
    # Create output structure
    output = {
        'name': 'DHS Budget Data',
        'total_amount': float(df['amount'].sum()),
        'fiscal_years': sorted(df['fiscal_year'].unique().tolist()),
        'availability_types': sorted(df['availability_type'].unique().tolist()),
        'bureaus': sorted(df['bureau'].unique().tolist()),
        'bureau_abbreviations': BUREAU_ABBREVIATIONS,
        'record_count': len(records),
        'data': records
    }
    
    # Save to file
    os.makedirs('data', exist_ok=True)
    output_file = 'processed_data/appropriations/dhs_budget_flat.json'
    with open(output_file, 'w') as f:
        json.dump(output, f, indent=2)
    
    print(f"Generated flat data file: {output_file}")
    print(f"Total records: {len(records)}")
    print(f"Total budget: ${output['total_amount']:,.0f}")
    
    # Summary by fiscal year
    print("\nSummary by fiscal year:")
    fy_summary = df.groupby('fiscal_year')['amount'].sum()
    for fy, amount in fy_summary.items():
        print(f"  FY {fy}: ${amount:,.0f}")
    
    # Summary by availability type
    print("\nSummary by availability type:")
    avail_summary = df.groupby('availability_type')['amount'].sum()
    for avail, amount in avail_summary.items():
        print(f"  {avail}: ${amount:,.0f}")

if __name__ == "__main__":
    generate_flat_data()