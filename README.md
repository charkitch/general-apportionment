# DHS Budget Apportionment Data Aggregation

This project demonstrates systematic extraction and aggregation of apportionment data from OpenOMB.org using Department of Homeland Security as a test case.

## How This Works

### What Gets Updated
When you run the update scripts, they pull all current DHS budget data from OpenOMB.org and regenerate the visualization files from scratch.

**Data files that get updated:**
- `data/dhs_tas_aggregated.csv` - Raw budget data by account
- `data/dhs_budget_flat.json` - Processed data for the visualization
- `data/update_metadata.json` - Timestamp of last update

### Data Collection Process

1. **Find DHS Budget Files**
   - Scans OpenOMB.org for all DHS budget documents
   - Identifies ~2,000 budget files across all DHS components

2. **Extract Budget Amounts**
   - Calls OpenOMB's API for each file (no files are downloaded)
   - Extracts the total budget amount from each document
   - Groups by account code, expiration type, and fiscal year

3. **Generate Visualization Data**
   - Converts the raw data into a format optimized for the treemap
   - Creates the JSON file that powers the interactive visualization


## ⚠️ Data Notice

OpenOMB.org has not been updated for an extended period because the underlying data from OMB has not been available.

## Quick Start

### View the Visualization

Visit: https://abigailhaddad.github.io/apportionment/

### Update the Data

```bash
# Clone the repository
git clone https://github.com/abigailhaddad/apportionment.git
cd apportionment

# Install dependencies
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# Update all data
python update_all_data.py

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
python update_all_data.py
```

This will:
- Check if OpenOMB is accessible
- Regenerate all data from scratch (takes ~10-15 minutes)
- Update the timestamp metadata

### Manual Update

If you need more control, you can run the scripts separately:

#### Step 1: Get DHS File Metadata

```bash
python get_dhs_metadata.py
```

This creates:
- `data/dhs_files_with_fy.csv` - Metadata for all DHS files including fiscal year and TAFS
- `data/dhs_accounts_summary.csv` - Summary of all DHS accounts
- `data/dhs_complete_file_ids.json` - Just the file IDs for reference

#### Step 2: Aggregate Budget Data

```bash
# For all DHS data (2,056 files, ~10-15 minutes)
python aggregate_dhs_budget_by_tas.py --output data/dhs_tas_aggregated.csv

# For specific fiscal year
python aggregate_dhs_budget_by_tas.py --fy 2025 --output data/dhs_fy2025_tas_aggregated.csv

# For specific component/account
python aggregate_dhs_budget_by_tas.py \
    --bureau "Transportation Security Administration" \
    --account "Operations and Support" \
    --output data/tsa_ops.csv
```

## Visualization

The project includes an interactive treemap visualization that allows you to:
- Explore budget data by component, account, and TAS
- Filter by fiscal year and availability type
- Click to drill down into detailed views
- See budget amounts by component

### View Locally

```bash
python serve.py
# Open http://localhost:8000 in your browser
```


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

[View the Fund Type Crosswalk →](crosswalk.html)

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
├── get_dhs_metadata.py      # Scrapes OpenOMB for file metadata
├── aggregate_dhs_budget_by_tas.py  # Fetches and aggregates budget data
├── update_all_data.py       # Runs full update pipeline
├── index.html               # Main visualization page
├── treemap.js              # D3.js visualization code
├── serve.py                # Local development server
├── data/                   # Data files (git-ignored)
└── .github/workflows/      # GitHub Actions automation
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