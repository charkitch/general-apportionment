#!/usr/bin/env python3
"""
Process USAspending data with object class (PA-OC) breakdown.
Refactored to use common utilities.
"""

import pandas as pd
import numpy as np
from common_utils import (
    save_json,
    load_usaspending_data,
    map_tas_to_component,
    SPENDING_CATEGORIES,
    print_summary
)


# Object class code mappings
OBJECT_CLASS_MAPPINGS = {
    'personnel_compensation': ['11.1', '11.3', '11.5', '11.7', '11.8', '11.9'],
    'personnel_benefits': ['12.1', '12.2', '13.0'],
    'travel_transportation': ['21.0', '22.0'],
    'rent_utilities': ['23.1', '23.2', '23.3'],
    'other_services': ['24.0', '25.1', '25.2', '25.3', '25.4', '25.5', '25.6', '25.7', '25.8'],
    'supplies_equipment': ['26.0', '31.0'],
    'grants_fixed_charges': ['41.0', '42.0', '43.0', '44.0'],
    'other': ['32.0', '33.0', '91.0', '92.0', '93.0', '94.0']
}


def map_object_class_code(code):
    """Map object class code to category"""
    if pd.isna(code):
        return 'other'
    
    code_str = str(code).strip()
    
    # Direct mapping
    for category, codes in OBJECT_CLASS_MAPPINGS.items():
        if code_str in codes:
            return category
    
    # Check by prefix
    for category, codes in OBJECT_CLASS_MAPPINGS.items():
        for mapped_code in codes:
            if code_str.startswith(mapped_code.split('.')[0] + '.'):
                return category
    
    return 'other'


def process_usaspending_with_object_class():
    """Process USAspending PA-OC data"""
    
    print("Loading USAspending PA-OC data...")
    
    # Load PA-OC data using common loader
    df = load_usaspending_data(
        data_types=['PA-OC'],
        fiscal_years=['FY2022', 'FY2023', 'FY2024', 'FY2025']
    )
    
    if df.empty:
        print("No PA-OC data found!")
        return
    
    print(f"\nTotal PA-OC records loaded: {len(df)}")
    
    # Map TAS to components
    print("\nMapping TAS codes to components...")
    df = map_tas_to_component(df)
    
    # The PA-OC data uses 'treasury_account_symbol' instead of 'tas'
    if 'treasury_account_symbol' in df.columns and 'tas' not in df.columns:
        df['tas'] = df['treasury_account_symbol']
    
    # Map object class codes to categories
    print("\nMapping object class codes to categories...")
    df['object_class_category'] = df['object_class_code'].apply(map_object_class_code)
    
    # Create summary by TAS, component, and fiscal year
    print("\nCreating object class summary...")
    
    summary_data = []
    
    # Group by TAS, component, and fiscal year
    grouped = df.groupby(['fiscal_year', 'tas', 'component'])
    
    for (fiscal_year, tas, component), group in grouped:
        record = {
            'fiscal_year': int(fiscal_year),
            'tas': tas,
            'component': component,
            'total_obligations': float(group['obligations_incurred'].sum())
        }
        
        # Sum by object class category
        for category in OBJECT_CLASS_MAPPINGS.keys():
            amount = group[group['object_class_category'] == category]['obligations_incurred'].sum()
            record[category] = float(amount)
        
        # Calculate personnel percentage
        personnel_total = record.get('personnel_compensation', 0) + record.get('personnel_benefits', 0)
        if record['total_obligations'] > 0:
            record['personnel_percentage'] = float(personnel_total / record['total_obligations'] * 100)
        else:
            record['personnel_percentage'] = 0.0
        
        summary_data.append(record)
    
    # Convert to DataFrame for easier analysis
    summary_df = pd.DataFrame(summary_data)
    
    # Save detailed data
    save_json(df.to_dict('records'), 
              'processed_data/usaspending/usaspending_with_object_class.json',
              "Detailed USAspending data with object class")
    
    # Save summary CSV
    summary_df.to_csv('processed_data/usaspending/object_class_summary.csv', index=False)
    print(f"Summary saved to: processed_data/usaspending/object_class_summary.csv")
    
    # Print summaries
    print("\n=== Overall Object Class Breakdown ===")
    for fy in sorted(summary_df['fiscal_year'].unique()):
        fy_data = summary_df[summary_df['fiscal_year'] == fy]
        print(f"\nFY{fy}:")
        
        total_obligations = fy_data['total_obligations'].sum()
        
        for category in OBJECT_CLASS_MAPPINGS.keys():
            category_total = fy_data[category].sum()
            if category_total > 0:
                pct = category_total / total_obligations * 100
                print(f"  {category.replace('_', ' ').title()}: ${category_total/1e9:.2f}B ({pct:.1f}%)")
    
    # Component breakdown
    print_summary(summary_df, 'component', 'total_obligations', label='Components by Total Obligations')
    
    # Personnel percentage by component
    print("\n=== Personnel Percentage by Component ===")
    comp_personnel = summary_df.groupby('component').apply(
        lambda x: (x['personnel_compensation'].sum() + x['personnel_benefits'].sum()) / x['total_obligations'].sum() * 100
    ).sort_values(ascending=False)
    
    for comp, pct in comp_personnel.head(10).items():
        print(f"  {comp}: {pct:.1f}%")


if __name__ == "__main__":
    process_usaspending_with_object_class()