#!/usr/bin/env python3
"""
Investigate why CBP and ICE show outlays exceeding apportionments
"""

import pandas as pd

# Load the data
usaspending_file = "FY2025P01-P09_All_TAS_AccountData_2025-08-12_H10M36S53426004/FY2025P01-P09_All_TAS_AccountBalances_2025-08-12_H10M36S53_1.csv"
apportionment_file = "data/dhs_tas_aggregated_with_fund_types.csv"

print("Loading data...")
usaspending_df = pd.read_csv(usaspending_file)
apportionment_df = pd.read_csv(apportionment_file)

# Filter for CBP and ICE
cbp_ice_usaspending = usaspending_df[
    usaspending_df['treasury_account_name'].str.contains('Customs and Border Protection|Immigration and Customs Enforcement', na=False)
]

print(f"\n=== CBP and ICE USAspending Records ===")
print(f"Total records: {len(cbp_ice_usaspending)}")

# Group by component and availability period
for component in ['Customs and Border Protection', 'Immigration and Customs Enforcement']:
    print(f"\n=== {component} ===")
    
    component_data = cbp_ice_usaspending[
        cbp_ice_usaspending['treasury_account_name'].str.contains(component, na=False)
    ]
    
    # Show by fiscal year of appropriation
    summary = component_data.groupby(['beginning_period_of_availability', 'ending_period_of_availability', 'main_account_code']).agg({
        'budget_authority_appropriated_amount': 'sum',
        'obligations_incurred': 'sum',
        'gross_outlay_amount': 'sum'
    }).round(0)
    
    print("\nBy appropriation year:")
    print(summary.sort_index())
    
    # Show totals
    print(f"\nTotals across all years:")
    print(f"  Budget Authority: ${component_data['budget_authority_appropriated_amount'].sum():,.0f}")
    print(f"  Obligations: ${component_data['obligations_incurred'].sum():,.0f}")
    print(f"  Outlays: ${component_data['gross_outlay_amount'].sum():,.0f}")
    
    # Show FY2025 only
    fy2025_only = component_data[
        (component_data['beginning_period_of_availability'] == 2025) & 
        (component_data['ending_period_of_availability'] == 2025)
    ]
    
    print(f"\nFY2025 appropriations only:")
    print(f"  Budget Authority: ${fy2025_only['budget_authority_appropriated_amount'].sum():,.0f}")
    print(f"  Obligations: ${fy2025_only['obligations_incurred'].sum():,.0f}")
    print(f"  Outlays: ${fy2025_only['gross_outlay_amount'].sum():,.0f}")

# Check apportionment data
print("\n\n=== Apportionment Data ===")
cbp_apportionment = apportionment_df[apportionment_df['bureau'].str.contains('Customs and Border Protection', na=False)]
ice_apportionment = apportionment_df[apportionment_df['bureau'].str.contains('Immigration and Customs Enforcement', na=False)]

print(f"\nCBP Apportionment (FY2025):")
cbp_fy2025 = cbp_apportionment[cbp_apportionment['fiscal_year'] == '2025']
print(f"  Total: ${cbp_fy2025['amount'].sum():,.0f}")
print(f"  Number of records: {len(cbp_fy2025)}")

print(f"\nICE Apportionment (FY2025):")
ice_fy2025 = ice_apportionment[ice_apportionment['fiscal_year'] == '2025']
print(f"  Total: ${ice_fy2025['amount'].sum():,.0f}")
print(f"  Number of records: {len(ice_fy2025)}")

# Show the specific TAS codes
print("\n=== TAS Code Comparison ===")
print("\nCBP TAS in apportionment:")
print(sorted(cbp_apportionment['tas'].unique()))

print("\nCBP main accounts in USAspending:")
cbp_accounts = cbp_ice_usaspending[
    cbp_ice_usaspending['treasury_account_name'].str.contains('Customs and Border Protection', na=False)
]['main_account_code'].unique()
print(sorted([f"070-{acc}" for acc in cbp_accounts]))