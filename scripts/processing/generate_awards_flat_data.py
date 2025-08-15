#!/usr/bin/env python3
"""
Generate flat awards data for flexible aggregation in JavaScript.
Refactored to use common utilities.
"""

import pandas as pd
from common_utils import (
    save_json,
    create_metadata,
    print_summary,
    load_usaspending_data,
    map_tas_to_component,
    create_label_fields
)


def clean_award_type(value):
    """Clean up award type values"""
    value = str(value).strip()
    return 'Unknown' if pd.isna(value) or value == 'nan' else value


def clean_office_name(row):
    """Get clean awarding office name"""
    office = str(row.get('awarding_office_name', 'Unknown')).strip()
    if pd.isna(office) or office == 'nan':
        office = str(row.get('awarding_subagency_name', 'Unknown')).strip()
    if pd.isna(office) or office == 'nan':
        office = 'Unknown'
    return office


def truncate_text(text, max_length=50):
    """Truncate text for display"""
    text = str(text)
    return text[:max_length-3] + '...' if len(text) > max_length else text


def generate_awards_flat_data():
    """Generate flat awards data for treemap visualization"""
    
    print("Loading awards data from USAspending files...")
    
    # Use common loader for contracts and assistance
    df = load_usaspending_data(
        data_types=['Contracts', 'Assistance'],
        fiscal_years=['FY2023', 'FY2025']
    )
    
    if df.empty:
        print("No awards data found!")
        return
    
    print(f"\nTotal records loaded: {len(df)}")
    
    # Map TAS to components using common function
    print("\nMapping TAS codes to components...")
    df = map_tas_to_component(df)
    
    # Create flat data structure
    print("\nCreating flat data structure...")
    flat_data = []
    
    # Label configuration
    label_config = {
        'label_component': 'component',
        'label_award_type': lambda r: r['award_type'],
        'label_awarding_office': lambda r: truncate_text(r['awarding_office']),
        'label_recipient': lambda r: truncate_text(r['recipient_name'], 40),
        'label_full': ['component', 'awarding_office', 'award_type']
    }
    
    # Clean data before aggregation
    df['award_type'] = df['award_type'].apply(clean_award_type)
    df['awarding_office'] = df.apply(clean_office_name, axis=1)
    df['recipient_name'] = df['recipient_name'].fillna('Unknown').str.strip()
    df['recipient_state'] = df['recipient_state'].fillna('Unknown').str.strip()
    
    # Aggregate by key fields to reduce data size
    print("\nAggregating awards data...")
    aggregation_cols = [
        'fiscal_year',
        'component', 
        'treasury_account_symbol',
        'data_type',
        'award_type',
        'awarding_office',
        'recipient_name',
        'recipient_state',
        'product_or_service_code',
        'product_or_service_code_description',
        'naics_code',
        'naics_description'
    ]
    
    # Group and aggregate
    agg_df = df.groupby(aggregation_cols).agg({
        'transaction_obligated_amount': 'sum',
        'gross_outlay_amount_FYB_to_period_end': 'sum',
        'award_id_piid': 'count'  # Count of transactions
    }).reset_index()
    
    # Rename columns
    agg_df.rename(columns={
        'data_type': 'award_category',
        'transaction_obligated_amount': 'obligations',
        'gross_outlay_amount_FYB_to_period_end': 'outlays',
        'award_id_piid': 'transaction_count'
    }, inplace=True)
    
    # Filter out zero amounts
    agg_df = agg_df[
        (agg_df['obligations'] != 0) | 
        (agg_df['outlays'] != 0)
    ]
    
    print(f"Aggregated to {len(agg_df):,} records from {len(df):,} transactions")
    
    # Process aggregated records
    processed_count = 0
    for _, row in agg_df.iterrows():
        try:
            # Build record
            record = {
                'fiscal_year': int(row['fiscal_year']),
                'component': row['component'],
                'treasury_account_symbol': row['treasury_account_symbol'],
                'award_category': row['award_category'],
                'award_type': row['award_type'],
                'awarding_office': row['awarding_office'],
                'recipient_name': row['recipient_name'],
                'recipient_state': row['recipient_state'],
                'product_or_service_code': row.get('product_or_service_code', ''),
                'product_or_service_code_description': row.get('product_or_service_code_description', ''),
                'naics_code': row.get('naics_code', ''),
                'naics_description': row.get('naics_description', ''),
                'transaction_count': int(row['transaction_count']),
                'obligations': float(row['obligations']),
                'outlays': float(row['outlays']),
            }
            
            # Add labels using common function
            record = create_label_fields(record, label_config)
            
            flat_data.append(record)
            processed_count += 1
            
            if processed_count % 10000 == 0:
                print(f"  Processed {processed_count} records...")
                
        except Exception as e:
            print(f"Error processing record: {e}")
            continue
    
    print(f"\nProcessed {len(flat_data)} records with obligations")
    
    # Save the flat data
    save_json(flat_data, 'processed_data/usaspending/awards_flat.json',
              f"Awards flat data ({len(flat_data)} records)")
    
    # Create metadata with additional fields
    if flat_data:
        df_flat = pd.DataFrame(flat_data)
        additional_fields = {
            'award_types': sorted(df_flat['award_type'].unique().tolist()),
            'total_obligations': float(df_flat['obligations'].sum()),
            'total_outlays': float(df_flat['outlays'].sum())
        }
    else:
        additional_fields = {
            'award_types': [],
            'total_obligations': 0,
            'total_outlays': 0
        }
    
    metadata = create_metadata(flat_data, additional_fields)
    save_json(metadata, 'processed_data/usaspending/awards_metadata.json', "Awards metadata")
    
    # Print summaries using common function
    if flat_data:
        df_flat = pd.DataFrame(flat_data)
        print_summary(df_flat, 'component', 'obligations', label='Components')
        print_summary(df_flat, 'award_type', 'obligations', label='Award Types')
        print_summary(df_flat, 'awarding_office', 'obligations', label='Awarding Offices')


if __name__ == "__main__":
    generate_awards_flat_data()