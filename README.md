# DHS Budget Apportionment Data Aggregation

This project demonstrates systematic extraction and aggregation of apportionment data from OpenOMB.org using Department of Homeland Security as a test case.

## Data Extraction Method

### Step 1: File Discovery
- **Source**: OpenOMB sitemap at `/sitemaps/accounts.xml`
- **Filter**: URLs matching `/agency/department-of-homeland-security/bureau/*/account/*`
- **Extraction**: From each account page, captures:
  - File IDs from href attributes (`/file/{id}`)
  - TAFS codes and fiscal years from URL fragments (`#tafs_{id}--{tafs}--{iteration}--{fiscal_year}`)

### Step 2: Data Aggregation
- **API Call**: For each file ID: `/api/v1/file/{id}`
- **Data Point**: Line 1920 from Schedule A ("Total budgetary resources available")
- **Grouping**: Aggregates by TAS + availability period + fiscal year
- **Assumption**: Each file represents one iteration of an apportionment; latest iteration supersedes previous

### Step 3: Output Structure
The aggregated data includes:
- Treasury Account Symbol (TAS)
- Availability period (annual, multi-year, or no-year)
- Bureau and account names
- Fiscal year
- Total budgetary resources (line 1920 amount)
- Approval date and iteration number

## Key Assumptions for Validation

1. **TAFS Extraction**: The URL fragment pattern `#tafs_{file_id}--{tafs}--{iteration}--{fiscal_year}` is consistent across all files
2. **Line 1920**: This line consistently represents total budgetary resources across all apportionments
3. **Completeness**: The sitemap includes all published DHS apportionments
4. **Aggregation Logic**: Summing line 1920 by TAS/period/year provides meaningful totals

## ⚠️ Data Notice

OpenOMB.org has not been updated for an extended period because the underlying data from OMB has not been available.

## Quick Start

### View the Visualization

Visit the GitHub Pages site: `https://[your-username].github.io/apportion/`

### Update the Data

```bash
# Clone the repository
git clone https://github.com/[your-username]/apportion.git
cd apportion

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

# For specific bureau/account
python aggregate_dhs_budget_by_tas.py \
    --bureau "Transportation Security Administration" \
    --account "Operations and Support" \
    --output data/tsa_ops.csv
```

## Visualization

The project includes an interactive treemap visualization that allows you to:
- Explore budget data by bureau, account, and TAS
- Filter by fiscal year and availability type
- Click to drill down into detailed views
- See budget amounts and obligation rates

### View Locally

```bash
python serve.py
# Open http://localhost:8000 in your browser
```

### Deploy to GitHub Pages

The visualization is designed to work directly from GitHub Pages. Simply enable GitHub Pages for your repository and point it to the root directory.

## Data Format

The aggregated data includes:
- **tas**: Treasury Account Symbol (e.g., 070-0530)
- **availability_period**: When funds can be spent (e.g., 2023/2025, X for no-year)
- **bureau**: DHS component (CBP, FEMA, TSA, etc.)
- **account**: Budget account name
- **fiscal_year**: The budget year being reported
- **amount**: Total budgetary resources available
- **approval_date**: When this apportionment was approved
- **iteration**: Version number of the apportionment

## Understanding the Data

- **Multi-year money** (e.g., 2023/2025): Can be spent over multiple years
- **Annual money** (e.g., just 2025): Must be spent in that fiscal year
- **No-year money** (X): Never expires

The amounts shown are **budget authority** (permission to spend), not actual outlays.

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