#!/usr/bin/env python3
"""Check overlap between budget data and FAST Book"""
import pandas as pd

# Load budget data
budget_df = pd.read_csv('data/dhs_tas_aggregated.csv')
budget_df['tas_account'] = budget_df['tas'].str.split('-').str[1]

# Check the unmapped FEMA accounts
unmapped = budget_df[budget_df['tas_account'].isin(['0700', '0702', '0703'])]
print('=== Unmapped FEMA Accounts ===')
print(unmapped[['tas', 'account', 'amount']].drop_duplicates('account').sort_values('amount', ascending=False))
print(f'\nTotal amount in unmapped accounts: ${unmapped["amount"].sum():,.0f}')
print(f'This represents {unmapped["amount"].sum() / budget_df["amount"].sum() * 100:.1f}% of total DHS budget')

# Let's check if these might have slightly different codes in FAST Book
fast_df = pd.read_csv('data/fast_book/dhs_tas_fund_type_mapping.csv')
print('\n=== Checking FAST Book for similar FEMA accounts ===')
fema_fast = fast_df[fast_df['Title'].str.contains('Federal Emergency Management Agency', na=False)]
print(f'Found {len(fema_fast)} FEMA entries in FAST Book')
print('\nFEMA accounts in FAST Book:')
print(fema_fast[['TAS', 'Fund Type', 'Title']].head(15))

# Look for accounts starting with 07
print('\n=== Looking for accounts with 070X07 pattern ===')
seven_accounts = fast_df[fast_df['TAS'].str.contains('070.07', regex=True)]
print(seven_accounts[['TAS', 'Fund Type', 'Title']])