# Configuration Guide

All configuration for the DHS Budget Analysis tools is centralized in `config/data_schema.yaml`. This allows you to modify behavior without changing code.

## Key Configuration Sections

### 1. Analysis Settings

#### Fiscal Years
```yaml
analysis_settings:
  comparison_years:
    current: 2025    # Current fiscal year for analysis
    previous: 2023   # Previous year for comparison
  
  data_processing:
    fiscal_years_to_load: ["FY2023", "FY2025"]  # Which years to process
```

#### Vendor Analysis
```yaml
vendor_analysis:
  items_per_page: 50          # Pagination size
  top_vendors_count: 50       # Number of vendors in treemap
  top_growth_count: 50        # Top growing/declining vendors
  max_contracts_shown: 100    # Individual contracts in details
  max_products_shown: 10      # Product categories shown
  max_industries_shown: 5     # NAICS codes shown
  default_min_amount: 1000000 # Default filter ($1M)
```

### 2. Component Names

Control how components are displayed:
```yaml
component_display:
  use_abbreviations: true    # Show "FEMA" instead of full name
  standardize_names: true    # Ensure consistency

dimensions:
  component:
    abbreviations:
      "Federal Emergency Management Agency": "FEMA"
      "U.S. Customs and Border Protection": "CBP"
      # ... etc
```

### 3. Visualization Settings

```yaml
visualization:
  color_scheme: "tableau20"
  treemap_padding: 2
  treemap_min_label_width: 30
  chart_margins:
    top: 40
    right: 120
    bottom: 60
    left: 80
```

### 4. Data Processing

```yaml
data_processing:
  max_description_length: 500    # Truncate long text
  aggregation_limit: 50000       # Performance threshold
  
file_patterns:
  contracts: "*Contracts_AccountBreakdownByAward*.csv"
  assistance: "*Assistance_AccountBreakdownByAward*.csv"
```

### 5. Display Formats

```yaml
display_formats:
  fiscal_year_format: "FY {year}"
  currency_precision:
    billions: 2    # $1.23B
    millions: 2    # $1.23M
    thousands: 0   # $123K
```

## Making Changes

### To change fiscal years:
1. Update `comparison_years` for the analysis years
2. Update `fiscal_years_to_load` to include new data files
3. Re-run the data processing scripts

### To change vendor analysis limits:
- Modify values under `vendor_analysis`
- Changes take effect immediately on page reload

### To add/update component abbreviations:
- Add entries under `dimensions.component.abbreviations`
- Used automatically by all tools

### To adjust visualizations:
- Modify `visualization` settings
- Affects treemaps, bar charts, etc.

## Python Usage

```python
from config_loader import config

# Get fiscal years
years = config.get_fiscal_years()

# Get vendor settings
vendor_config = config.get_vendor_settings()
max_shown = vendor_config.get('max_contracts_shown', 100)

# Get component abbreviations
abbreviations = config.get_component_abbreviations()
```

## JavaScript Usage

```javascript
// Config is loaded automatically
const maxContracts = analysisConfig?.vendor_analysis?.max_contracts_shown || 100;

// Component names use common utilities
const displayName = getComponentName(fullName);  // Uses abbreviations from YAML
```

## Benefits

1. **No code changes needed** - Adjust analysis by editing YAML
2. **Consistency** - All tools use the same configuration
3. **Version control** - Track configuration changes over time
4. **Documentation** - Settings are self-documenting
5. **Flexibility** - Easy to add new fiscal years or adjust limits