# Refactoring Analysis for Data Processing Scripts

## Current Code Duplication

### 1. Type Conversion (`convert_types`)
- **Found in**: 3 files (awards, spending flat, spending category treemap)
- **Refactored to**: `common_utils.py`

### 2. TAS to Component Mapping
- **Found in**: Multiple files with slight variations
- **Refactored to**: `common_utils.map_tas_to_component()`

### 3. JSON Saving with Type Conversion
- **Pattern**: Open file, convert types, dump JSON
- **Refactored to**: `common_utils.save_json()`

### 4. Metadata Creation
- **Pattern**: Create dict with last_updated, fiscal_years, components, etc.
- **Refactored to**: `common_utils.create_metadata()`

### 5. Summary Printing
- **Pattern**: Group by field, sum amounts, format currency, print top N
- **Refactored to**: `common_utils.print_summary()`

## Remaining Duplication to Address

### 1. USAspending Data Loading
Multiple scripts load USAspending data with similar patterns:
- Loading multiple fiscal years
- Filtering for DHS (agency 070)
- Combining contracts and assistance data

**Potential refactor**:
```python
def load_usaspending_data(data_types=['contracts', 'assistance'], fiscal_years=['FY2023', 'FY2025']):
    """Load and combine USAspending data files"""
```

### 2. Flat Data Structure Creation
Pattern of iterating through records and creating flat structure with labels

**Potential refactor**:
```python
def create_flat_records(df, grouping_fields, label_config):
    """Create flat records with automatic label generation"""
```

### 3. Object Class Category Mapping
The spending categories definition is duplicated

**Potential refactor**:
```python
SPENDING_CATEGORIES = {
    'Personnel': ['personnel_compensation', 'personnel_benefits'],
    'Contracts & Services': ['other_services'],
    # etc...
}
```

## Benefits of Refactoring

1. **Maintenance**: Changes to type conversion or mapping logic only need to be made once
2. **Consistency**: All scripts use the same formatting and conversion logic
3. **Testing**: Can unit test common functions once
4. **New Features**: Easy to add new processing scripts using common utilities
5. **Performance**: Could add caching to component mapping loading

## Next Steps

1. ✅ Create `common_utils.py` with basic utilities
2. ✅ Test with one script (spending flat data)
3. 🔄 Refactor remaining scripts to use common utilities
4. 🔄 Add more specialized utilities (USAspending loader, etc.)
5. 🔄 Add unit tests for common utilities