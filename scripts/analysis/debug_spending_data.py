#!/usr/bin/env python3
"""
Debug script to understand the USAspending data structure and why numbers don't align
"""

import pandas as pd
import json

# Load the USAspending data
usaspending_file = "FY2025P01-P09_All_TAS_AccountData_2025-08-12_H10M36S53426004/FY2025P01-P09_All_TAS_AccountBalances_2025-08-12_H10M36S53_1.csv"

print("Loading USAspending data...")
df = pd.read_csv(usaspending_file)

print(f"\nTotal records: {len(df)}")
print(f"Columns: {list(df.columns)}")

# Check the period of availability years
print("\n=== Period of Availability Analysis ===")
print("Unique beginning_period_of_availability:")
print(df['beginning_period_of_availability'].value_counts().head(20))

print("\nUnique ending_period_of_availability:")
print(df['ending_period_of_availability'].value_counts().head(20))

# Look at availability type codes
print("\n=== Availability Type Codes ===")
print(df['availability_type_code'].value_counts())

# Filter for just FY2025 appropriations
fy2025_only = df[
    (df['beginning_period_of_availability'] == 2025) | 
    (df['ending_period_of_availability'] == 2025)
]
print(f"\n=== FY2025 Appropriations Only ===")
print(f"Records with FY2025 availability: {len(fy2025_only)}")

# Compare totals
print("\n=== Financial Totals Comparison ===")
print(f"All records:")
print(f"  Total budget authority: ${df['budget_authority_appropriated_amount'].sum():,.0f}")
print(f"  Total obligations: ${df['obligations_incurred'].sum():,.0f}")
print(f"  Total outlays: ${df['gross_outlay_amount'].sum():,.0f}")

print(f"\nFY2025 appropriations only:")
print(f"  Total budget authority: ${fy2025_only['budget_authority_appropriated_amount'].sum():,.0f}")
print(f"  Total obligations: ${fy2025_only['obligations_incurred'].sum():,.0f}")
print(f"  Total outlays: ${fy2025_only['gross_outlay_amount'].sum():,.0f}")

# Look at FEMA specifically
print("\n=== FEMA Analysis ===")
fema_data = df[df['treasury_account_name'].str.contains('Federal Emergency Management Agency', na=False)]
print(f"FEMA records: {len(fema_data)}")

# Group by availability years
fema_by_year = fema_data.groupby(['beginning_period_of_availability', 'ending_period_of_availability']).agg({
    'budget_authority_appropriated_amount': 'sum',
    'obligations_incurred': 'sum',
    'gross_outlay_amount': 'sum'
}).round(0)

print("\nFEMA by availability period:")
print(fema_by_year.head(10))

# Look at specific TAS examples
print("\n=== Sample TAS Records ===")
sample_tas = df[df['treasury_account_symbol'] == '070-2025/2025-0700-000']
if len(sample_tas) > 0:
    print("Sample TAS: 070-2025/2025-0700-000")
    for col in ['budget_authority_appropriated_amount', 'obligations_incurred', 'gross_outlay_amount']:
        print(f"  {col}: ${sample_tas[col].iloc[0]:,.0f}")

# Check for multi-year funds
print("\n=== Multi-year and No-year Funds ===")
multi_year = df[df['beginning_period_of_availability'] != df['ending_period_of_availability']]
print(f"Multi-year funds: {len(multi_year)} records")

no_year = df[df['availability_type_code'] == 'X']
print(f"No-year funds: {len(no_year)} records")

# Save a sample for inspection
print("\n=== Saving sample data ===")
sample_df = df.head(20)
sample_df.to_csv('usaspending_sample.csv', index=False)
print("Saved first 20 records to usaspending_sample.csv for inspection")