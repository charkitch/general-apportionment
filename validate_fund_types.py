#!/usr/bin/env python3
"""
Validate fund type coverage and report statistics
"""
import pandas as pd
from datetime import datetime

def validate_fund_types():
    """Validate fund type coverage for DHS budget data"""
    
    print("=" * 80)
    print(f"Fund Type Validation Report - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 80)
    
    # Load the FAST Book mapping
    print("\n1. Loading FAST Book mapping...")
    fast_df = pd.read_csv('data/fast_book/dhs_tas_fund_type_mapping.csv')
    
    # Extract account codes using same logic as merge script
    def extract_account_code(tas):
        if tas.startswith('070X'):
            account = tas[4:]
        elif tas.startswith('070 '):
            account = tas[4:]
        else:
            account = tas
        account = account.split('.')[0]
        return account.strip()
    
    fast_df['account_code'] = fast_df['TAS'].apply(extract_account_code)
    fast_accounts = set(fast_df['account_code'].unique())
    print(f"   - Found {len(fast_accounts)} unique account codes in FAST Book")
    print(f"   - Fund types in FAST Book: {', '.join(sorted(fast_df['Fund Type'].unique()))}")
    
    # Load budget data
    print("\n2. Loading DHS budget data...")
    budget_df = pd.read_csv('data/dhs_tas_aggregated.csv')
    budget_df['account_code'] = budget_df['tas'].str.split('-').str[1]
    budget_accounts = set(budget_df['account_code'].unique())
    print(f"   - Found {len(budget_accounts)} unique account codes in budget data")
    print(f"   - Total records: {len(budget_df):,}")
    print(f"   - Total amount: ${budget_df['amount'].sum():,.0f}")
    
    # Calculate coverage
    print("\n3. Coverage Analysis")
    mapped_accounts = budget_accounts & fast_accounts
    unmapped_accounts = budget_accounts - fast_accounts
    
    print(f"   - Mapped accounts: {len(mapped_accounts)} ({len(mapped_accounts)/len(budget_accounts)*100:.1f}%)")
    print(f"   - Unmapped accounts: {len(unmapped_accounts)} ({len(unmapped_accounts)/len(budget_accounts)*100:.1f}%)")
    
    # Calculate financial coverage
    mapped_df = budget_df[budget_df['account_code'].isin(mapped_accounts)]
    unmapped_df = budget_df[budget_df['account_code'].isin(unmapped_accounts)]
    
    mapped_amount = mapped_df['amount'].sum()
    unmapped_amount = unmapped_df['amount'].sum()
    total_amount = budget_df['amount'].sum()
    
    print(f"\n4. Financial Coverage")
    print(f"   - Mapped amount: ${mapped_amount:,.0f} ({mapped_amount/total_amount*100:.1f}%)")
    print(f"   - Unmapped amount: ${unmapped_amount:,.0f} ({unmapped_amount/total_amount*100:.1f}%)")
    
    # Detail unmapped accounts
    if len(unmapped_accounts) > 0:
        print(f"\n5. Unmapped Accounts Detail")
        unmapped_summary = unmapped_df.groupby(['account_code', 'account', 'bureau']).agg({
            'amount': 'sum',
            'tas': 'count'
        }).sort_values('amount', ascending=False)
        unmapped_summary.columns = ['total_amount', 'record_count']
        
        for (account_code, account_name, bureau), row in unmapped_summary.iterrows():
            pct = row['total_amount'] / unmapped_amount * 100
            print(f"   - {account_code}: {account_name} ({bureau})")
            print(f"     Amount: ${row['total_amount']:,.0f} ({pct:.1f}% of unmapped)")
            print(f"     Records: {row['record_count']}")
    
    # Fund type distribution (if we have the merged file)
    try:
        print("\n6. Fund Type Distribution (from merged data)")
        merged_df = pd.read_csv('data/dhs_tas_aggregated_with_fund_types.csv')
        fund_summary = merged_df.groupby('fund_type').agg({
            'amount': ['sum', 'count']
        })
        fund_summary.columns = ['total_amount', 'record_count']
        fund_summary['percent'] = (fund_summary['total_amount'] / fund_summary['total_amount'].sum() * 100)
        fund_summary = fund_summary.sort_values('total_amount', ascending=False)
        
        for fund_type, row in fund_summary.iterrows():
            print(f"   - {fund_type}: ${row['total_amount']:,.0f} ({row['percent']:.1f}%)")
            print(f"     Records: {row['record_count']:,}")
            
        # Budget category distribution
        print("\n7. Budget Category Distribution")
        cat_summary = merged_df.groupby('budget_category').agg({
            'amount': ['sum', 'count']
        })
        cat_summary.columns = ['total_amount', 'record_count']
        cat_summary['percent'] = (cat_summary['total_amount'] / cat_summary['total_amount'].sum() * 100)
        cat_summary = cat_summary.sort_values('total_amount', ascending=False)
        
        for category, row in cat_summary.iterrows():
            print(f"   - {category}: ${row['total_amount']:,.0f} ({row['percent']:.1f}%)")
            print(f"     Records: {row['record_count']:,}")
            
    except FileNotFoundError:
        print("\n   Note: Run merge_fund_types.py to see fund type distribution")
    
    print("\n" + "=" * 80)

if __name__ == "__main__":
    validate_fund_types()