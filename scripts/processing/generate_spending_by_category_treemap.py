#!/usr/bin/env python3
"""
Generate spending treemap data organized by spending category (object class).
Shows what DHS spends money on, with agency colors.
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
    elif isinstance(obj, dict):
        return {k: convert_types(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_types(item) for item in obj]
    return obj

def generate_spending_by_category_treemap():
    """Generate treemap data structured by spending category"""
    
    print("Loading object class summary data...")
    df = pd.read_csv('processed_data/usaspending/object_class_summary.csv')
    
    # Define spending categories
    categories = {
        'Personnel': ['personnel_compensation', 'personnel_benefits'],
        'Contracts & Services': ['other_services'],
        'Grants': ['grants_fixed_charges'],
        'Facilities': ['rent_utilities'],
        'Supplies & Equipment': ['supplies_equipment'],
        'Travel': ['travel_transportation'],
        'Other': ['other']
    }
    
    # Create hierarchical structure by fiscal year
    treemap_data = {
        'name': 'DHS Spending',
        'children': []
    }
    
    # Process each fiscal year
    for fiscal_year in sorted(df['fiscal_year'].unique()):
        fy_data = df[df['fiscal_year'] == fiscal_year]
        
        year_node = {
            'name': f'FY{fiscal_year}',
            'fiscal_year': fiscal_year,
            'children': []
        }
        
        # Create nodes for each spending category
        for category_name, columns in categories.items():
            category_node = {
                'name': category_name,
                'children': []
            }
            
            # Calculate total for this category across all agencies
            category_total = 0
            
            # Group by component within each category
            for _, row in fy_data.iterrows():
                # Sum the columns for this category
                category_amount = sum(row[col] for col in columns if col in row)
                
                if category_amount > 0:
                    category_total += category_amount
                    
                    # Find or create component node
                    component_name = row['component']
                    component_node = next(
                        (n for n in category_node['children'] if n['name'] == component_name),
                        None
                    )
                    
                    if not component_node:
                        component_node = {
                            'name': component_name,
                            'component': component_name,  # For coloring
                            'children': []
                        }
                        category_node['children'].append(component_node)
                    
                    # Add TAS as leaf node
                    tas_node = {
                        'name': row['tas'],
                        'component': component_name,  # For coloring
                        'value': float(category_amount),
                        'percentage_of_total': float(category_amount / row['total_obligations'] * 100) if row['total_obligations'] > 0 else 0
                    }
                    component_node['children'].append(tas_node)
            
            # Only add category if it has data
            if category_node['children']:
                category_node['value'] = float(category_total)
                year_node['children'].append(category_node)
        
        # Add year node if it has data
        if year_node['children']:
            treemap_data['children'].append(year_node)
    
    # Save the treemap data
    output_file = 'processed_data/usaspending/spending_by_category_treemap.json'
    with open(output_file, 'w') as f:
        json.dump(convert_types(treemap_data), f, indent=2)
    
    print(f"Treemap data saved to: {output_file}")
    
    # Also create a summary by category
    summary_data = []
    
    for fiscal_year in df['fiscal_year'].unique():
        fy_data = df[df['fiscal_year'] == fiscal_year]
        
        # Calculate totals by category
        personnel_total = fy_data['personnel_compensation'].sum() + fy_data['personnel_benefits'].sum()
        contracts_total = fy_data['other_services'].sum()
        grants_total = fy_data['grants_fixed_charges'].sum()
        facilities_total = fy_data['rent_utilities'].sum()
        supplies_total = fy_data['supplies_equipment'].sum()
        travel_total = fy_data['travel_transportation'].sum()
        other_total = fy_data['other'].sum()
        
        total_all = personnel_total + contracts_total + grants_total + facilities_total + supplies_total + travel_total + other_total
        
        summary_data.append({
            'fiscal_year': int(int(fiscal_year)),
            'total_obligations': float(total_all),
            'personnel': float(personnel_total),
            'personnel_pct': float(personnel_total / total_all * 100) if total_all > 0 else 0,
            'contracts_services': float(contracts_total),
            'contracts_pct': float(contracts_total / total_all * 100) if total_all > 0 else 0,
            'grants': float(grants_total),
            'grants_pct': float(grants_total / total_all * 100) if total_all > 0 else 0,
            'facilities': float(facilities_total),
            'facilities_pct': float(facilities_total / total_all * 100) if total_all > 0 else 0,
            'supplies_equipment': float(supplies_total),
            'supplies_pct': float(supplies_total / total_all * 100) if total_all > 0 else 0,
            'travel': float(travel_total),
            'travel_pct': float(travel_total / total_all * 100) if total_all > 0 else 0,
            'other': float(other_total),
            'other_pct': float(other_total / total_all * 100) if total_all > 0 else 0
        })
    
    # Save summary
    summary_file = 'processed_data/usaspending/spending_category_summary.json'
    with open(summary_file, 'w') as f:
        json.dump(summary_data, f, indent=2)
    
    print(f"Summary saved to: {summary_file}")
    
    # Print summary
    print("\n=== Spending by Category ===")
    for data in summary_data:
        print(f"\nFY{data['fiscal_year']}:")
        print(f"  Personnel: ${data['personnel']/1e9:.2f}B ({data['personnel_pct']:.1f}%)")
        print(f"  Contracts & Services: ${data['contracts_services']/1e9:.2f}B ({data['contracts_pct']:.1f}%)")
        print(f"  Grants: ${data['grants']/1e9:.2f}B ({data['grants_pct']:.1f}%)")
        print(f"  Facilities: ${data['facilities']/1e9:.2f}B ({data['facilities_pct']:.1f}%)")
        print(f"  Supplies & Equipment: ${data['supplies_equipment']/1e9:.2f}B ({data['supplies_pct']:.1f}%)")

if __name__ == "__main__":
    generate_spending_by_category_treemap()