#!/usr/bin/env python3
"""
Common utilities for data processing scripts.
Reduces code duplication across flat file generators.
"""

import pandas as pd
import numpy as np
import json
import os
import glob
from datetime import datetime


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


def save_json(data, filepath, description="data"):
    """Save data to JSON file with type conversion"""
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    
    with open(filepath, 'w') as f:
        json.dump(convert_types(data), f, indent=2)
    
    print(f"{description} saved to: {filepath}")


def load_component_mapping():
    """Load TAS to component mapping from budget data"""
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
        
        return tas_to_component
    except Exception as e:
        print(f"Error loading component mapping: {e}")
        return {}


def map_tas_to_component(df, tas_column='tas'):
    """Map TAS codes to component names in a dataframe"""
    tas_to_component = load_component_mapping()
    
    if 'main_account_code' in df.columns:
        # For USAspending data with separate main_account_code
        df['tas_simple'] = df.apply(lambda r: f"070-{int(r['main_account_code']):04d}", axis=1)
    elif tas_column in df.columns:
        # For data with full TAS codes
        df['tas_simple'] = df[tas_column].apply(lambda x: '-'.join(str(x).split('-')[:2]))
    else:
        print(f"Warning: No TAS column found for mapping")
        df['component'] = 'Unknown'
        return df
    
    df['component'] = df['tas_simple'].map(tas_to_component).fillna('Unknown')
    
    mapped_count = len(df[df['component'] != 'Unknown'])
    unmapped_count = len(df[df['component'] == 'Unknown'])
    
    print(f"  Mapped {mapped_count} records to components")
    if unmapped_count > 0:
        print(f"  {unmapped_count} records have unknown component")
    
    return df


def create_metadata(df_or_records, additional_fields=None):
    """Create standard metadata for a dataset"""
    if isinstance(df_or_records, list):
        df = pd.DataFrame(df_or_records) if df_or_records else pd.DataFrame()
        total_records = len(df_or_records)
    else:
        df = df_or_records
        total_records = len(df)
    
    metadata = {
        'last_updated': datetime.now().isoformat(),
        'total_records': total_records
    }
    
    # Add standard fields if they exist
    if not df.empty:
        if 'fiscal_year' in df.columns:
            metadata['fiscal_years'] = sorted(df['fiscal_year'].unique().tolist())
        
        if 'component' in df.columns:
            metadata['components'] = sorted(df['component'].unique().tolist())
    
    # Add any additional fields
    if additional_fields:
        metadata.update(additional_fields)
    
    return metadata


def print_summary(df, groupby_field, value_field='amount', top_n=10, label=None):
    """Print a summary of top values by a grouping field"""
    if df.empty:
        print("No data to summarize")
        return
    
    label = label or groupby_field.replace('_', ' ').title()
    summary = df.groupby(groupby_field)[value_field].sum().sort_values(ascending=False)
    
    print(f"\n=== Top {label} ===")
    for item, amount in summary.head(top_n).items():
        # Truncate long names
        if isinstance(item, str) and len(item) > 50:
            item = item[:47] + "..."
        
        # Format amount
        if abs(amount) >= 1e9:
            amount_str = f"${amount/1e9:.2f}B"
        elif abs(amount) >= 1e6:
            amount_str = f"${amount/1e6:.1f}M"
        else:
            amount_str = f"${amount:,.0f}"
        
        print(f"  {item}: {amount_str}")


def filter_dhs_data(df, agency_column='agency_identifier_code', agency_code=70):
    """Filter dataframe for DHS records only"""
    if agency_column in df.columns:
        df_filtered = df[df[agency_column] == agency_code]
        print(f"  Found {len(df_filtered)} DHS records")
        return df_filtered
    else:
        print(f"  Warning: {agency_column} not found, returning all records")
        return df


# Spending categories used across multiple scripts
SPENDING_CATEGORIES = {
    'Personnel': ['personnel_compensation', 'personnel_benefits'],
    'Contracts & Services': ['other_services'],
    'Grants': ['grants_fixed_charges'],
    'Facilities': ['rent_utilities'],
    'Supplies & Equipment': ['supplies_equipment'],
    'Travel': ['travel_transportation'],
    'Other': ['other']
}


def load_usaspending_data(data_types=None, fiscal_years=None, file_patterns=None):
    """
    Load USAspending data from multiple files.
    
    Args:
        data_types: List of data types to load (e.g., ['Contracts', 'Assistance'])
        fiscal_years: List of fiscal years to load (e.g., ['FY2023', 'FY2025'])
        file_patterns: Dict of custom file patterns by data type
    
    Returns:
        Combined dataframe with all data
    """
    if data_types is None:
        data_types = ['Contracts', 'Assistance']
    
    if fiscal_years is None:
        fiscal_years = ['FY2023', 'FY2025']
    
    if file_patterns is None:
        file_patterns = {
            'Contracts': '*Contracts_AccountBreakdownByAward*.csv',
            'Assistance': '*Assistance_AccountBreakdownByAward*.csv',
            'PA-OC': '*AccountBreakdownByPA-OC*.csv'
        }
    
    all_data = []
    
    for fy in fiscal_years:
        print(f"\nProcessing {fy} data...")
        
        for data_type in data_types:
            if data_type not in file_patterns:
                continue
                
            pattern = f'raw_data/usaspending/{fy}/{file_patterns[data_type]}'
            files = glob.glob(pattern)
            
            for file in files:
                print(f"  Loading {os.path.basename(file)}...")
                try:
                    df = pd.read_csv(file, low_memory=False)
                    
                    # Filter for DHS
                    df = filter_dhs_data(df)
                    
                    if len(df) > 0:
                        df['fiscal_year'] = int(fy[2:6])
                        df['data_type'] = data_type
                        all_data.append(df)
                except Exception as e:
                    print(f"    Error loading file: {e}")
    
    if all_data:
        return pd.concat(all_data, ignore_index=True)
    else:
        return pd.DataFrame()


def create_label_fields(record, label_config):
    """
    Create label fields for a record based on configuration.
    
    Args:
        record: Dict with data fields
        label_config: Dict mapping label names to source fields or functions
    
    Returns:
        Dict with added label fields
    """
    for label_name, source in label_config.items():
        if callable(source):
            record[label_name] = source(record)
        elif isinstance(source, str) and source in record:
            record[label_name] = record[source]
        elif isinstance(source, list):
            # Combine multiple fields
            parts = [str(record.get(field, '')) for field in source if record.get(field)]
            record[label_name] = ' - '.join(parts)
    
    return record