#!/usr/bin/env python3
"""
Generate flat spending data for flexible aggregation in JavaScript.
Refactored to use common utilities.
"""

import pandas as pd
from common_utils import (
    save_json, 
    create_metadata, 
    print_summary,
    SPENDING_CATEGORIES,
    create_label_fields
)


def generate_spending_flat_data():
    """Generate flat spending data for treemap visualization"""
    
    print("Loading object class summary data...")
    df = pd.read_csv('processed_data/usaspending/object_class_summary.csv')
    
    # Create flat data structure
    flat_data = []
    
    # Label configuration
    label_config = {
        'label_component': 'component',
        'label_category': 'category',
        'label_tas': 'tas',
        'label_full': ['component', 'category']
    }
    
    for _, row in df.iterrows():
        # Create a record for each category that has spending
        for category_name, columns in SPENDING_CATEGORIES.items():
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
                }
                
                # Add individual category amounts for detailed breakdown
                for col in columns:
                    if col in row:
                        record[col] = float(row[col])
                
                # Add labels using common function
                record = create_label_fields(record, label_config)
                
                flat_data.append(record)
    
    # Save the flat data
    save_json(flat_data, 'processed_data/usaspending/spending_flat.json', 
              f"Flat spending data ({len(flat_data)} records)")
    
    # Create metadata with additional fields
    additional_fields = {
        'categories': list(SPENDING_CATEGORIES.keys())
    }
    metadata = create_metadata(flat_data, additional_fields)
    save_json(metadata, 'processed_data/usaspending/spending_metadata.json', "Metadata")
    
    # Print summary statistics
    summary_df = pd.DataFrame(flat_data)
    
    print("\n=== Summary by Fiscal Year ===")
    for fy in sorted(summary_df['fiscal_year'].unique()):
        fy_data = summary_df[summary_df['fiscal_year'] == fy]
        print(f"\nFY{fy}:")
        category_totals = fy_data.groupby('category')['amount'].sum().sort_values(ascending=False)
        total = category_totals.sum()
        for cat, amount in category_totals.items():
            print(f"  {cat}: ${amount/1e9:.2f}B ({amount/total*100:.1f}%)")


if __name__ == "__main__":
    generate_spending_flat_data()