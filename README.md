# DHS Budget Analysis Tools

Interactive tools for analyzing Department of Homeland Security budget data from OpenOMB.org and USAspending.gov.

## Overview

This repository contains two main visualization tools:

1. **Budget Explorer** (`explorer.html`) - Interactive visualization of DHS budget data across multiple dimensions:
   - View apportionments from OpenOMB.org
   - Track obligations and outlays from USAspending.gov  
   - Analyze awards and contracts data
   - Filter by component, fiscal year, and spending category
   - Configuration-driven for easy updates

2. **Spending Lifecycle Tracker** (`spending_lifecycle.html`) - Track funding flow through the federal spending process:
   - See how Congressional appropriations become obligations and outlays
   - Compare execution rates across components and fund types
   - Understand the timing of federal spending

## Data Sources

- **OpenOMB.org** - OMB apportionment data (budget authority)
- **USAspending.gov** - Obligations, outlays, and award data
- **Treasury FAST Book** - Fund type classifications


## Data Notes

- OpenOMB.org has not been updated for an extended period because the underlying data from OMB has not been available
- USAspending data is current through the most recent reporting period
- All amounts are in nominal dollars

## Quick Start

```bash
# Clone the repository
git clone https://github.com/abigailhaddad/apportionment.git
cd apportionment

# Install dependencies
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# Update all data
python scripts/utilities/update_all_data.py

# View locally
python serve.py
# Open http://localhost:8000
```

## Installation

1. Clone this repository
2. Create and activate a virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Usage

### Automatic Update (Recommended)

Run the update script to refresh all data:

```bash
python scripts/utilities/update_all_data.py
```

This will:
- Check if OpenOMB is accessible
- Regenerate all data from scratch (takes ~10-15 minutes)
- Update the timestamp metadata

### Manual Update

If you need more control, you can run the scripts separately:

#### Step 1: Get DHS File Metadata

```bash
python scripts/utilities/get_dhs_metadata.py
```

This creates:
- `raw_data/openomb/dhs_files_with_fy.csv` - Metadata for all DHS files including fiscal year and TAFS
- `raw_data/openomb/dhs_accounts_summary.csv` - Summary of all DHS accounts
- `raw_data/openomb/dhs_complete_file_ids.json` - Just the file IDs for reference

#### Step 2: Aggregate Budget Data

```bash
# For all DHS data (2,056 files, ~10-15 minutes)
python scripts/processing/aggregate_dhs_budget_by_tas.py

# For specific fiscal year
python scripts/processing/aggregate_dhs_budget_by_tas.py --fy 2025

# For specific component/account
python scripts/processing/aggregate_dhs_budget_by_tas.py \
    --bureau "Transportation Security Administration" \
    --account "Operations and Support"
```

## Features

### Budget Explorer
- Interactive treemap visualization
- Multiple data sources (apportionments, obligations, outlays, awards)
- Dynamic filtering and grouping
- Configuration-driven architecture
- Automatic updates when selections change

### Spending Lifecycle Tracker  
- Shows funding flow: Apportionment → Obligations → Outlays
- Execution rate analysis by component
- Fund type breakdown (annual, multi-year, no-year)
- Drill-down to detailed spending data


## Data Format

The aggregated data includes:
- **tas**: Treasury Account Symbol (e.g., 070-0530)
- **availability_period**: When funds can be spent (e.g., 2023/2025, X for no-year)
- **component**: DHS component (CBP, FEMA, TSA, etc.)
- **account**: Budget account name
- **fiscal_year**: The budget year being reported
- **amount**: Total budgetary resources available
- **fund_type**: From Treasury FAST Book (General Funds, Special Funds, etc.)
- **budget_category**: Discretionary, Mandatory, or Other
- **approval_date**: When this apportionment was approved
- **iteration**: Version number of the apportionment

## Understanding the Data

### What the Numbers Mean
The amounts shown are **budget authority** - Congress's permission for agencies to spend money. This is different from actual spending.

### Types of Money
- **No-year (X)**: Never expires - common for disaster response (FEMA)
- **Annual (e.g., 2025/2025)**: Must be spent in that fiscal year
- **Multi-year (e.g., 2023/2025)**: Can be spent over multiple years

### Fund Types and Budget Categories

We categorize every DHS budget account using the Treasury's official fund type classifications. Here's what we do:

1. **Get fund types from Treasury FAST Book**: We use the U.S. Treasury's Federal Account Symbols and Titles (FAST) Book, which is the authoritative source for what type of fund each budget account is. The FAST Book Part II (downloaded August 11, 2025) lists all federal accounts and their fund types.

2. **Map DHS accounts**: Every DHS account has a Treasury Account Symbol (TAS) like "070-0530". We match these TAS codes to the FAST Book to find out if it's General Funds, Special Funds, Trust Funds, etc.

3. **Assign budget categories**: Based on the fund type, we categorize each account as:
   - **Discretionary**: General Funds that require annual Congressional appropriation (most DHS operations)
   - **Mandatory**: Special Funds, Trust Funds, and Revolving Funds where spending is set by law (like USCIS fees, FEMA flood insurance)
   - **Other**: Deposit Funds that are temporary holdings

This lets you filter and view the budget by fund type (how the money is legally structured) or budget category (whether Congress votes on it annually).

### Why This Matters
When Congress appropriates money to DHS, OMB divides it among components through "apportionments." This tool shows how that money is distributed.

## Automated Updates

This repository includes a GitHub Actions workflow that:
- Runs weekly to regenerate all data from OpenOMB.org
- Automatically commits any changes to the data files
- Creates an issue if the update fails

You can also manually trigger an update from the Actions tab in GitHub.

## Development

### Project Structure

```
apportion/
├── scripts/
│   ├── utilities/
│   │   ├── get_dhs_metadata.py     # Scrapes OpenOMB for file metadata
│   │   └── update_all_data.py      # Runs full update pipeline
│   └── processing/
│       ├── aggregate_dhs_budget_by_tas.py  # Fetches and aggregates budget data
│       ├── download_fast_book.py           # Gets Treasury fund types
│       ├── merge_fund_types.py             # Adds fund types to budget data
│       ├── generate_treemap_views.py       # Creates visualization JSON
│       ├── process_usaspending_to_json.py  # Validates USAspending data
│       ├── aggregate_usaspending_by_appropriation_year.py  # Aggregates by year
│       └── create_spending_lifecycle_data.py  # Combines all spending data
├── raw_data/                # Source data files
│   ├── openomb/            # OpenOMB metadata
│   ├── fast_book/          # Treasury FAST Book
│   └── usaspending/        # USAspending bulk downloads
├── processed_data/         # Processed outputs
│   ├── appropriations/     # Budget data
│   ├── usaspending/        # Spending data
│   └── spending_lifecycle/ # Combined data
├── index.html              # Landing page  
├── explorer.html           # Unified budget explorer
├── spending_lifecycle.html # Spending lifecycle tracker
├── js/                     # JavaScript modules
│   ├── config_loader.js    # Configuration loader
│   └── explorer.js         # Explorer logic
├── config/                 # Configuration files
│   └── data_schema.yaml    # Data schema and dimensions
├── spending_lifecycle.js   # Spending lifecycle code
└── serve.py               # Local development server
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

This project is in the public domain within the United States.

## Acknowledgments

Data source: [OpenOMB.org](https://openomb.org) - Office of Management and Budget

---

# DETAILED DATA PROCESSING DOCUMENTATION

## Data Sources and Processing Pipeline

### 1. OpenOMB Apportionment Data

**Source**: OpenOMB.org API  
**Update Frequency**: When OMB releases new apportionments  
**Last Known Update**: Data has not been updated for an extended period

#### Data Collection Process

1. **Discovery Phase** (`scripts/utilities/get_dhs_metadata.py`)
   - Queries OpenOMB API for all DHS-related files
   - Extracts metadata including:
     - File IDs and URLs
     - Fiscal year (parsed from filenames like "FY 2025 DHS TAFS 70-0530")
     - Component/Bureau names
     - Account names
     - Treasury Account Symbols (TAS)
   - Creates: `raw_data/openomb/dhs_files_with_fy.csv`

2. **Aggregation Phase** (`scripts/processing/aggregate_dhs_budget_by_tas.py`)
   - For each file ID, calls OpenOMB API to get budget data
   - Key fields extracted:
     - `budgetAuthority`: Total amount available
     - `tafs`: Full Treasury Appropriation Fund Symbol
     - `periodOfAvailability`: When funds can be used
     - `approvalDate`: When OMB approved this apportionment
     - `iteration`: Version number (higher = more recent)
   - Groups by TAS + availability period + fiscal year
   - Takes the latest iteration for each unique combination
   - Output: `processed_data/appropriations/dhs_tas_aggregated.csv`

#### TAS Format and Parsing

Treasury Account Symbols have the format: `AAA-YYYY/YYYY-MMMM-SSS`
- `AAA`: Agency code (070 for DHS)
- `YYYY/YYYY`: Period of availability (e.g., 2023/2025 for 3-year money)
- `MMMM`: Main account code
- `SSS`: Sub-account code

We create a simplified TAS (`AAA-MMMM`) for matching with other data sources.

### 2. Treasury FAST Book Data

**Source**: U.S. Treasury Federal Account Symbols and Titles (FAST) Book  
**Purpose**: Provides official fund type classifications  
**Update Frequency**: Quarterly

#### Processing (`scripts/processing/download_fast_book.py`)

1. Downloads Part II Excel file from Treasury website
2. Filters for DHS accounts (Agency ID = 70)
3. Extracts:
   - Account symbols
   - Fund types (General, Special, Trust, Revolving, Deposit)
   - Account titles
4. Creates mapping: `raw_data/fast_book/dhs_fast_book_accounts.csv`

#### Fund Type to Budget Category Mapping

```python
FUND_TYPE_TO_CATEGORY = {
    'General fund': 'Discretionary',
    'Special fund': 'Mandatory',
    'Trust fund': 'Mandatory',
    'Revolving fund': 'Mandatory',
    'Public enterprise fund': 'Mandatory',
    'Intragovernmental fund': 'Mandatory',
    'Deposit fund': 'Other'
}
```

### 3. USAspending Data Integration

**Source**: USAspending.gov bulk download files  
**Purpose**: Track actual obligations and outlays  
**Files**: Quarterly Account Balances files (e.g., `FY2023P01-P12_All_TAS_AccountBalances_*.csv`)

#### Key USAspending Fields

- `treasury_account_symbol`: Full TAS for matching
- `beginning_period_of_availability`: Start year for the appropriation
- `ending_period_of_availability`: End year (same as begin for annual funds)
- `budget_authority_appropriated_amount`: Congressional appropriation
- `obligations_incurred`: Legal commitments to spend
- `gross_outlay_amount`: Actual payments made
- `treasury_account_name`: Human-readable account name

#### Processing Pipeline

1. **Initial Processing** (`scripts/processing/process_usaspending_to_json.py`)
   - Validates TAS codes against apportionment data
   - Maps treasury account names to DHS components
   - Tracks validation statistics:
     - TAS match rate: ~81.8%
     - Component match rate: ~99.8%

2. **Aggregation by Appropriation Year** (`scripts/processing/aggregate_usaspending_by_appropriation_year.py`)
   - Groups by appropriation fiscal year (not reporting year)
   - Includes availability type from apportionment data
   - Critical: Sums obligations/outlays across all years for multi-year funds

3. **Spending Lifecycle Data Creation** (`scripts/processing/create_spending_lifecycle_data.py`)
   - **Key Innovation**: Aggregates USAspending data across all reporting years
   - Matches to apportionment data by TAS + availability period
   - Prevents double-counting when same fund appears in multiple years
   - Creates: `processed_data/spending_lifecycle/spending_lifecycle_data.json`

### 4. Data Validation and Crosswalking

#### Component Name Mapping

USAspending uses different component names than OpenOMB. We maintain a mapping:

```python
component_keywords = {
    'Customs and Border Protection': ['Customs', 'CBP'],
    'Immigration and Customs Enforcement': ['ICE'],
    'Transportation Security Administration': ['TSA'],
    'Coast Guard': ['Coast Guard', 'USCG'],
    'Federal Emergency Management Agency': ['FEMA'],
    'Cybersecurity and Infrastructure Security Agency': ['CISA', 'Cybersecurity'],
    'United States Secret Service': ['Secret Service', 'USSS']
}
```

#### Validation Steps

1. **TAS Validation**
   - Check if USAspending TAS exists in apportionment data
   - Track unmatched TAS codes for investigation
   - Log match rates for quality assurance

2. **Component Validation**
   - Extract component from treasury_account_name field
   - Match against known DHS bureaus
   - Flag "Unknown" components for review

3. **Availability Period Matching**
   - Parse beginning/ending periods from USAspending
   - Construct period string (e.g., "2023/2025")
   - Match exactly with apportionment availability_period

#### Multi-Year Fund Handling

**Challenge**: A 2022/2023 multi-year fund can have:
- Apportionment split across FY2022 and FY2023
- Obligations/outlays appearing in FY2022, FY2023, FY2024, etc.

**Solution**: 
1. Match by full TAS + availability period (not just fiscal year)
2. Aggregate USAspending data across all reporting years before joining
3. Show obligation/outlay rates against the specific fund's apportionment

### 5. Spending Lifecycle Tracking

The spending lifecycle shows: **Apportionment → Obligations → Outlays**

#### Key Metrics

- **Obligation Rate**: Obligations ÷ Apportionment
  - Annual funds: Should be ~95-99% by year end
  - Multi-year funds: Lower rates expected
  - No-year funds: Varies widely

- **Outlay Rate**: Outlays ÷ Apportionment
  - Typically lags obligations by months/years
  - Annual funds: May take 2-3 years to reach 90%+

- **Execution Rate**: Outlays ÷ Obligations
  - Shows how quickly obligated funds are spent
  - Varies by program type

#### Availability Type Analysis

```
FY2023 Results:
- Annual funds: 98.6% obligated, 72.3% outlaid
- Multi-year funds: 74.4% obligated, 27.0% outlaid
- No-year funds: Varies by program
```

### 6. Data Quality Notes

#### Known Issues

1. **USAspending Coverage**: Not all TAS codes in apportionment appear in USAspending
2. **Timing Differences**: Apportionment dates vs obligation dates can differ
3. **Component Names**: Require manual mapping between data sources

#### Match Rates

- TAS matching: ~81.8% (234 of 287 unique TAS codes)
- Component matching: ~99.8% (only TSA FAMS unmatched)
- Overall record matching: 570 of 848 possible combinations

### 7. Update Procedures

The `scripts/utilities/update_all_data.py` orchestrates the entire pipeline:

1. Downloads latest FAST Book data
2. Fetches DHS metadata from OpenOMB
3. Aggregates budget data by TAS
4. Merges fund type classifications
5. Generates visualization files
6. Processes USAspending data (if not skipped)
7. Creates spending lifecycle data
8. Validates all output files exist

**Parameters**:
- `--skip-fast-book`: Skip Treasury data download
- `--skip-usaspending`: Skip USAspending processing

### 8. Output Files

#### Primary Data Files
- `processed_data/appropriations/dhs_tas_aggregated_with_fund_types.csv`: Main budget data
- `processed_data/spending_lifecycle/spending_lifecycle_data.json`: Combined apportionment + spending
- `processed_data/appropriations/dhs_budget_flat.json`: Treemap visualization data

#### Validation Files
- `processed_data/usaspending/usaspending_validation_summary.json`: Match statistics
- `processed_data/appropriations/update_metadata.json`: Last update timestamp

