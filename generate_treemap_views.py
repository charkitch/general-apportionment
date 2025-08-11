#!/usr/bin/env python3
"""
Generate pre-aggregated views for the treemap visualization
This creates separate JSON files for each aggregation mode with proper labels
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
    df = pd.read_csv('data/dhs_tas_aggregated.csv')
    
    # Add availability type
    df['availability_type'] = df['availability_period'].apply(
        lambda x: 'no-year' if x == 'X' else ('multi-year' if '/' in str(x) else 'annual')
    )
    
    return df

def create_hierarchical_json(df, hierarchy_levels, label_format=None):
    """
    Create a hierarchical JSON structure for D3
    
    hierarchy_levels: list of column names to group by
    label_format: function to format labels at each level
    """
    def build_tree(data, levels, parent_info=None):
        if not levels:
            return None
            
        level = levels[0]
        remaining_levels = levels[1:]
        
        if parent_info is None:
            parent_info = {}
        
        nodes = []
        for value, group_data in data.groupby(level):
            # Inherit parent info
            node_info = parent_info.copy()
            node_info[level] = value
            
            # Calculate the total amount for this node
            total_amount = group_data['amount'].sum()
            
            # Create node
            node = {
                'name': str(value),
                'label': str(value),  # Default label
                'value': float(total_amount),
                'amount': float(total_amount),
                **node_info  # Include all parent info
            }
            
            # Apply custom label formatting if provided
            if label_format:
                node['label'] = label_format(level, value, node_info, total_amount)
            
            # Add abbreviation for bureaus
            if level == 'bureau' and value in BUREAU_ABBREVIATIONS:
                node['abbreviation'] = BUREAU_ABBREVIATIONS[value]
            
            # Recurse for children
            if remaining_levels:
                children = build_tree(group_data, remaining_levels, node_info)
                if children:
                    node['children'] = children
                    # Remove value from parent nodes (D3 will sum children)
                    del node['value']
            
            nodes.append(node)
        
        return nodes
    
    # Build the tree
    children = build_tree(df, hierarchy_levels)
    
    # Create root node
    root = {
        'name': 'DHS Total',
        'label': 'DHS Total',
        'children': children
    }
    
    return root

def generate_all_views():
    """Generate all view files"""
    df = load_data()
    
    print("Generating treemap views...")
    
    # 1. Default view: Bureau -> Account -> TAS
    print("  - Default view (Bureau → Account → TAS)")
    default_view = create_hierarchical_json(
        df, 
        ['bureau', 'account', 'tas_full'],
        label_format=lambda level, value, info, amt: value
    )
    
    # 2. Bureau -> Account (no TAS breakdown)
    print("  - Bureau → Account view")
    bureau_account_view = create_hierarchical_json(
        df,
        ['bureau', 'account'],
        label_format=lambda level, value, info, amt: value
    )
    
    # 3. Bureau -> Fiscal Year
    print("  - Bureau → Fiscal Year view")
    bureau_year_view = create_hierarchical_json(
        df,
        ['bureau', 'fiscal_year'],
        label_format=lambda level, value, info, amt: f"FY {value}" if level == 'fiscal_year' else value
    )
    
    # 4. Bureau totals only
    print("  - Bureau Total view")
    bureau_total_view = create_hierarchical_json(
        df,
        ['bureau'],
        label_format=lambda level, value, info, amt: value
    )
    
    # 5. TAS -> Bureau -> Year (alternative hierarchy)
    print("  - TAS hierarchy view")
    tas_view = create_hierarchical_json(
        df,
        ['tas', 'bureau', 'fiscal_year'],
        label_format=lambda level, value, info, amt: f"FY {value}" if level == 'fiscal_year' else value
    )
    
    # Save all views
    views = {
        'default': default_view,
        'bureau_account': bureau_account_view,
        'bureau_year': bureau_year_view,
        'bureau_total': bureau_total_view,
        'tas_hierarchy': tas_view
    }
    
    os.makedirs('data/views', exist_ok=True)
    
    for name, view_data in views.items():
        output_file = f'data/views/{name}.json'
        with open(output_file, 'w') as f:
            json.dump(view_data, f, indent=2)
        print(f"    Saved: {output_file}")
    
    # Also save a metadata file with fiscal years and availability types
    metadata = {
        'fiscal_years': sorted(df['fiscal_year'].unique().tolist()),
        'availability_types': ['all', 'no-year', 'multi-year', 'annual'],
        'bureaus': sorted(df['bureau'].unique().tolist()),
        'bureau_abbreviations': BUREAU_ABBREVIATIONS,
        'total_amount': float(df['amount'].sum()),
        'record_count': len(df)
    }
    
    with open('data/views/metadata.json', 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"\nGenerated {len(views)} views with metadata")
    print(f"Total DHS budget: ${metadata['total_amount']:,.0f}")

if __name__ == "__main__":
    generate_all_views()