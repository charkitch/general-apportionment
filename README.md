# DHS Budget Apportionment Data Aggregation

This project demonstrates systematic extraction and aggregation of apportionment data from OpenOMB.org using Department of Homeland Security as a test case.

## How This Works

### What Gets Updated
When DHS submits new budget apportionments to OMB, they appear on OpenOMB.org. Our scripts check for these updates and refresh the visualization data.

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

## Key Assumptions for Validation

1. **TAFS Extraction**: The URL fragment pattern `#tafs_{file_id}--{tafs}--{iteration}--{fiscal_year}` is consistent across all files
2. **Line 1920**: This line consistently represents total budgetary resources across all apportionments
3. **Completeness**: The sitemap includes all published DHS apportionments
4. **Aggregation Logic**: Summing line 1920 by TAS/period/year provides meaningful totals

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
- Fetch the latest metadata
- Download and aggregate all budget data
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
- See budget amounts and obligation rates

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
- **approval_date**: When this apportionment was approved
- **iteration**: Version number of the apportionment

## Understanding the Data

### What the Numbers Mean
The amounts shown are **budget authority** - Congress's permission for agencies to spend money. This is different from actual spending.

### Types of Money
- **No-year (X)**: Never expires - common for disaster response (FEMA)
- **Annual (e.g., 2025/2025)**: Must be spent in that fiscal year
- **Multi-year (e.g., 2023/2025)**: Can be spent over multiple years

### Why This Matters
When Congress appropriates money to DHS, OMB divides it among components through "apportionments." This tool shows how that money is distributed.

## Automated Updates

This repository includes a GitHub Actions workflow that:
- Runs weekly to check for new data
- Automatically updates the data if changes are found
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