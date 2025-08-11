#!/usr/bin/env python3
import pandas as pd

# Load the merged data
df = pd.read_csv('data/dhs_tas_aggregated_with_fund_types.csv')

# Check what's in 'Other' category
other_df = df[df['budget_category'] == 'Other']
print('=== Records in Other category ===')
print(f'Total records: {len(other_df)}')
print(f'Total amount: ${other_df["amount"].sum():,.0f}')

# Group by fiscal year
print('\n=== Other category by fiscal year ===')
by_year = other_df.groupby('fiscal_year')['amount'].agg(['sum', 'count'])
print(by_year)

# Show the actual records
print('\n=== All records in Other category ===')
print(other_df[['tas', 'fiscal_year', 'bureau', 'account', 'fund_type', 'amount']])

# Check which fund types map to Other
print('\n=== Fund types that map to Other ===')
other_fund_types = other_df['fund_type'].unique()
print(other_fund_types)

# Let's also check all FY 2025 data
print('\n\n=== All FY 2025 budget categories ===')
fy2025 = df[df['fiscal_year'] == 2025]
cat_summary = fy2025.groupby('budget_category')['amount'].agg(['sum', 'count'])
print(cat_summary)