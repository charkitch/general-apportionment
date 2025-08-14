#!/usr/bin/env python3
"""
Generate flat spending data for flexible aggregation in JavaScript.
Similar to the budget flat data, but with object class categories.
"""

import pandas as pd
import json
import os
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
    return obj

def generate_spending_flat_data():
    """Generate flat spending data for treemap visualization"""
    
    print("Loading object class summary data...")
    df = pd.read_csv('processed_data/usaspending/object_class_summary.csv')
    
    # Define spending categories (same as before)
    categories = {
        'Personnel': ['personnel_compensation', 'personnel_benefits'],
        'Contracts & Services': ['other_services'],
        'Grants': ['grants_fixed_charges'],
        'Facilities': ['rent_utilities'],
        'Supplies & Equipment': ['supplies_equipment'],
        'Travel': ['travel_transportation'],
        'Other': ['other']
    }
    
    # Create flat data structure
    flat_data = []
    
    for _, row in df.iterrows():
        # Create a record for each category that has spending
        for category_name, columns in categories.items():
            # Sum the columns for this category
            category_amount = sum(row[col] for col in columns if col in row)
            
            if category_amount > 0:
                record = {
                    'fiscal_year': int(row['fiscal_year']),
                    'tas': row['tas'],
                    'component': row['component'],
                    'category': category_name,
                    'amount': float(category_amount),
                    'total_obligations': float(row['total_obligations']),
                    'percentage_of_tas': float(category_amount / row['total_obligations'] * 100) if row['total_obligations'] > 0 else 0,
                    # Labels for display
                    'label_component': row['component'],
                    'label_category': category_name,
                    'label_tas': row['tas'],
                    'label_full': f"{row['component']} - {category_name}"
                }
                
                # Add individual category amounts for detailed breakdown
                for col in columns:
                    if col in row:
                        record[col] = float(row[col])
                
                flat_data.append(record)
    
    # Save the flat data
    output_file = 'processed_data/usaspending/spending_flat.json'
    with open(output_file, 'w') as f:
        json.dump(convert_types(flat_data), f, indent=2)
    
    print(f"Flat spending data saved to: {output_file}")
    print(f"Total records: {len(flat_data)}")
    
    # Create metadata about available components
    components = sorted(df['component'].unique())
    metadata = {
        'last_updated': datetime.now().isoformat(),
        'fiscal_years': sorted(df['fiscal_year'].unique().tolist()),
        'components': components,
        'categories': list(categories.keys()),
        'total_records': len(flat_data)
    }
    
    metadata_file = 'processed_data/usaspending/spending_metadata.json'
    with open(metadata_file, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"Metadata saved to: {metadata_file}")
    
    # Print summary statistics
    print("\n=== Summary by Fiscal Year ===")
    summary_df = pd.DataFrame(flat_data)
    for fy in sorted(summary_df['fiscal_year'].unique()):
        fy_data = summary_df[summary_df['fiscal_year'] == fy]
        print(f"\nFY{fy}:")
        category_totals = fy_data.groupby('category')['amount'].sum().sort_values(ascending=False)
        total = category_totals.sum()
        for cat, amount in category_totals.items():
            print(f"  {cat}: ${amount/1e9:.2f}B ({amount/total*100:.1f}%)")

if __name__ == "__main__":
    generate_spending_flat_data()