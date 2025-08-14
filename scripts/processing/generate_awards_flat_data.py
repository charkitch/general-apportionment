#!/usr/bin/env python3
"""
Generate flat awards data for flexible aggregation in JavaScript.
Processes contract awards data to show who gets DHS money.
"""

import pandas as pd
import json
import os
import glob
from datetime import datetime
import numpy as np

def convert_types(obj):
    """Convert numpy types to Python native types for JSON serialization"""
    if isinstance(obj, (np.int64, np.int32)):
        return int(obj)
    elif isinstance(obj, (np.float64, np.float32)):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, dict):
        return {k: convert_types(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_types(item) for item in obj]
    elif pd.isna(obj):
        return None
    return obj

def load_awards_data():
    """Load all awards data from USAspending files"""
    all_data = []
    
    # Process each fiscal year
    for fy in ['FY2023', 'FY2025']:
        print(f"\nProcessing {fy} awards data...")
        
        # Load contracts data
        contracts_pattern = f'raw_data/usaspending/{fy}/*Contracts_AccountBreakdownByAward*.csv'
        contracts_files = glob.glob(contracts_pattern)
        
        for file in contracts_files:
            print(f"  Loading {os.path.basename(file)}...")
            try:
                df = pd.read_csv(file, low_memory=False)
                
                # Filter for DHS only (agency code 070)
                df = df[df['agency_identifier_code'] == 70]
                
                if len(df) > 0:
                    df['fiscal_year'] = int(fy[2:6])
                    df['award_category'] = 'Contracts'
                    all_data.append(df)
                    print(f"    Found {len(df)} DHS contract records")
            except Exception as e:
                print(f"    Error loading file: {e}")
        
        # Load assistance data (grants, etc.)
        assistance_pattern = f'raw_data/usaspending/{fy}/*Assistance_AccountBreakdownByAward*.csv'
        assistance_files = glob.glob(assistance_pattern)
        
        for file in assistance_files:
            print(f"  Loading {os.path.basename(file)}...")
            try:
                df = pd.read_csv(file, low_memory=False)
                
                # Filter for DHS only
                df = df[df['agency_identifier_code'] == '070']
                
                if len(df) > 0:
                    df['fiscal_year'] = int(fy[2:6])
                    df['award_category'] = 'Assistance'
                    all_data.append(df)
                    print(f"    Found {len(df)} DHS assistance records")
            except Exception as e:
                print(f"    Error loading file: {e}")
    
    if all_data:
        return pd.concat(all_data, ignore_index=True)
    else:
        return pd.DataFrame()

def map_tas_to_component(df):
    """Map TAS codes to component names"""
    # Load the component mapping from our budget data
    try:
        budget_df = pd.read_csv('processed_data/appropriations/dhs_tas_aggregated_with_fund_types.csv')
        
        # Create TAS to component mapping
        tas_to_component = {}
        for _, row in budget_df.iterrows():
            # Extract the base TAS (first part before any year info)
            tas_parts = row['tas'].split('-')
            if len(tas_parts) >= 2:
                tas_simple = f"{tas_parts[0]}-{tas_parts[1]}"
                if tas_simple not in tas_to_component:
                    tas_to_component[tas_simple] = row['bureau']
        
        # Apply mapping - the awards data already has main_account_code
        df['tas_simple'] = df.apply(lambda r: f"070-{int(r['main_account_code']):04d}", axis=1)
        df['component'] = df['tas_simple'].map(tas_to_component).fillna('Unknown')
        
        print(f"  Mapped {len(df[df['component'] != 'Unknown'])} records to components")
        print(f"  {len(df[df['component'] == 'Unknown'])} records have unknown component")
        
        return df
    except Exception as e:
        print(f"Error mapping components: {e}")
        import traceback
        traceback.print_exc()
        df['component'] = 'Unknown'
        return df

def generate_awards_flat_data():
    """Generate flat awards data for treemap visualization"""
    
    print("Loading awards data from USAspending files...")
    df = load_awards_data()
    
    if df.empty:
        print("No awards data found!")
        return
    
    print(f"\nTotal records loaded: {len(df)}")
    
    # Map TAS to components
    print("\nMapping TAS codes to components...")
    df = map_tas_to_component(df)
    
    # Create flat data structure at lowest level of aggregation
    print("\nCreating flat data structure...")
    flat_data = []
    
    # Key columns we need
    key_columns = [
        'fiscal_year',
        'component',
        'award_type',
        'awarding_office_name',
        'awarding_subagency_name',
        'recipient_name',
        'recipient_state',
        'recipient_city',
        'award_id_piid',
        'award_id_fain',
        'prime_award_base_transaction_description',
        'transaction_obligated_amount',
        'gross_outlay_amount_FYB_to_period_end'
    ]
    
    # Process each record
    for _, row in df.iterrows():
        try:
            # Skip if no obligations
            obligations = float(row.get('transaction_obligated_amount', 0) or 0)
            if obligations == 0:
                continue
            
            # Clean up award type
            award_type = str(row.get('award_type', 'Unknown')).strip()
            if pd.isna(award_type) or award_type == 'nan':
                award_type = 'Unknown'
            
            # Clean up office names
            awarding_office = str(row.get('awarding_office_name', 'Unknown')).strip()
            if pd.isna(awarding_office) or awarding_office == 'nan':
                awarding_office = str(row.get('awarding_subagency_name', 'Unknown')).strip()
            if pd.isna(awarding_office) or awarding_office == 'nan':
                awarding_office = 'Unknown'
            
            # Get recipient info
            recipient_name = str(row.get('recipient_name', 'Unknown')).strip()
            if pd.isna(recipient_name) or recipient_name == 'nan':
                recipient_name = 'Unknown'
            
            record = {
                'fiscal_year': int(row['fiscal_year']),
                'component': row['component'],
                'award_category': row['award_category'],
                'award_type': award_type,
                'awarding_office': awarding_office,
                'recipient_name': recipient_name,
                'recipient_state': str(row.get('recipient_state', 'Unknown')),
                'recipient_city': str(row.get('recipient_city', 'Unknown')),
                'award_id': row.get('award_id_piid') or row.get('award_id_fain') or 'Unknown',
                'description': str(row.get('prime_award_base_transaction_description', '')),
                'obligations': float(obligations),
                'outlays': float(row.get('gross_outlay_amount_FYB_to_period_end', 0) or 0),
                
                # Labels for display
                'label_component': row['component'],
                'label_award_type': award_type,
                'label_awarding_office': awarding_office,
                'label_recipient': recipient_name,
                'label_full': f"{row['component']} - {awarding_office} - {award_type}"
            }
            
            flat_data.append(record)
            
        except Exception as e:
            print(f"Error processing record: {e}")
            continue
    
    print(f"\nProcessed {len(flat_data)} records with obligations")
    
    # Save the flat data
    output_file = 'processed_data/usaspending/awards_flat.json'
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    
    with open(output_file, 'w') as f:
        json.dump(convert_types(flat_data), f, indent=2)
    
    print(f"\nFlat awards data saved to: {output_file}")
    
    # Create metadata
    if flat_data:
        df_flat = pd.DataFrame(flat_data)
        
        metadata = {
            'last_updated': datetime.now().isoformat(),
            'fiscal_years': sorted(df_flat['fiscal_year'].unique().tolist()),
            'components': sorted(df_flat['component'].unique().tolist()),
            'award_types': sorted(df_flat['award_type'].unique().tolist()),
            'total_records': len(flat_data),
            'total_obligations': float(df_flat['obligations'].sum()),
            'total_outlays': float(df_flat['outlays'].sum())
        }
    else:
        metadata = {
            'last_updated': datetime.now().isoformat(),
            'fiscal_years': [],
            'components': [],
            'award_types': [],
            'total_records': 0,
            'total_obligations': 0,
            'total_outlays': 0
        }
        df_flat = pd.DataFrame()
    
    metadata_file = 'processed_data/usaspending/awards_metadata.json'
    with open(metadata_file, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"Metadata saved to: {metadata_file}")
    
    # Print summary statistics
    if not df_flat.empty:
        print("\n=== Summary by Component ===")
        comp_summary = df_flat.groupby('component')['obligations'].sum().sort_values(ascending=False)
        for comp, amount in comp_summary.head(10).items():
            print(f"  {comp}: ${amount/1e9:.2f}B")
        
        print("\n=== Summary by Award Type ===")
        type_summary = df_flat.groupby('award_type')['obligations'].sum().sort_values(ascending=False)
        for award_type, amount in type_summary.head(10).items():
            print(f"  {award_type}: ${amount/1e9:.2f}B")
        
        print("\n=== Top Awarding Offices ===")
        office_summary = df_flat.groupby('awarding_office')['obligations'].sum().sort_values(ascending=False)
        for office, amount in office_summary.head(10).items():
            if len(office) > 50:
                office = office[:47] + "..."
            print(f"  {office}: ${amount/1e9:.2f}B")
    else:
        print("\nNo data to summarize")

if __name__ == "__main__":
    generate_awards_flat_data()