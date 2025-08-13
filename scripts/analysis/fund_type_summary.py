#!/usr/bin/env python3
"""
Display a clear summary of fund types and budget categories
"""
import pandas as pd

def show_fund_type_summary():
    """Show fund type and budget category summary"""
    
    # Load merged data
    df = pd.read_csv('data/dhs_tas_aggregated_with_fund_types.csv')
    
    print("=" * 80)
    print("DHS BUDGET FUND TYPE SUMMARY")
    print("=" * 80)
    
    # Overall totals
    total_amount = df['amount'].sum()
    print(f"\nTotal DHS Budget: ${total_amount:,.0f}")
    print(f"Total Records: {len(df):,}")
    
    # Fund Type Summary
    print("\n" + "="*60)
    print("FUND TYPES (from Treasury FAST Book)")
    print("="*60)
    
    fund_summary = df.groupby('fund_type').agg({
        'amount': ['sum', 'count']
    }).round(0)
    fund_summary.columns = ['Total Amount', 'Records']
    fund_summary['Percent'] = (fund_summary['Total Amount'] / total_amount * 100).round(1)
    fund_summary = fund_summary.sort_values('Total Amount', ascending=False)
    
    for fund_type, row in fund_summary.iterrows():
        print(f"\n{fund_type}:")
        print(f"  Amount: ${row['Total Amount']:,.0f} ({row['Percent']}%)")
        print(f"  Records: {int(row['Records']):,}")
        
        # Show top components for this fund type
        top_components = df[df['fund_type'] == fund_type].groupby('bureau')['amount'].sum().sort_values(ascending=False).head(3)
        if len(top_components) > 0:
            print(f"  Top Components:")
            for bureau, amount in top_components.items():
                pct = amount / row['Total Amount'] * 100
                print(f"    - {bureau}: ${amount:,.0f} ({pct:.1f}%)")
    
    # Budget Category Summary
    print("\n" + "="*60)
    print("BUDGET CATEGORIES (derived from fund types)")
    print("="*60)
    
    cat_summary = df.groupby('budget_category').agg({
        'amount': ['sum', 'count']
    }).round(0)
    cat_summary.columns = ['Total Amount', 'Records']
    cat_summary['Percent'] = (cat_summary['Total Amount'] / total_amount * 100).round(1)
    cat_summary = cat_summary.sort_values('Total Amount', ascending=False)
    
    for category, row in cat_summary.iterrows():
        print(f"\n{category}:")
        print(f"  Amount: ${row['Total Amount']:,.0f} ({row['Percent']}%)")
        print(f"  Records: {int(row['Records']):,}")
        
        # Show fund types in this category
        fund_types_in_cat = df[df['budget_category'] == category]['fund_type'].value_counts()
        print(f"  Fund Types:")
        for ft, count in fund_types_in_cat.items():
            ft_amount = df[(df['budget_category'] == category) & (df['fund_type'] == ft)]['amount'].sum()
            pct = ft_amount / row['Total Amount'] * 100
            print(f"    - {ft}: ${ft_amount:,.0f} ({pct:.1f}%)")
    
    # Mapping explanation
    print("\n" + "="*60)
    print("FUND TYPE TO BUDGET CATEGORY MAPPING")
    print("="*60)
    print("\nGeneral Funds    -> Discretionary (annual Congressional appropriations)")
    print("Trust Funds      -> Mandatory     (set by law, not annual appropriations)")
    print("Special Funds    -> Mandatory     (earmarked revenues)")
    print("Revolving Funds  -> Mandatory     (self-sustaining from fees/sales)")
    print("Deposit Funds    -> Other         (temporary holdings)")
    
    print("\n" + "="*80)

if __name__ == "__main__":
    show_fund_type_summary()