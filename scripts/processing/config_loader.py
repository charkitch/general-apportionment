#!/usr/bin/env python3
"""
Configuration loader for data schema
Loads and validates the YAML configuration that drives the entire system
"""
import yaml
import os
from typing import Dict, List, Any, Optional
from pathlib import Path


class DataConfig:
    """Loads and provides access to data schema configuration"""
    
    def __init__(self, config_path: str = 'config/data_schema.yaml'):
        """Initialize with config file path"""
        # Handle both absolute and relative paths
        if not os.path.isabs(config_path):
            # Get project root (2 levels up from this script)
            project_root = Path(__file__).parent.parent.parent
            config_path = project_root / config_path
            
        with open(config_path, 'r') as f:
            self.config = yaml.safe_load(f)
            
        self._validate_config()
    
    def _validate_config(self):
        """Validate configuration structure"""
        required_sections = ['dimensions', 'data_sources', 'valid_groupings']
        for section in required_sections:
            if section not in self.config:
                raise ValueError(f"Missing required section: {section}")
        
        # Validate dimension references in data sources
        all_dimensions = set(self.config['dimensions'].keys())
        for source_name, source_config in self.config['data_sources'].items():
            for dim in source_config.get('dimensions', []):
                if dim not in all_dimensions:
                    raise ValueError(f"Unknown dimension '{dim}' in data source '{source_name}'")
    
    def get_dimension(self, dimension_name: str) -> Dict[str, Any]:
        """Get configuration for a specific dimension"""
        return self.config['dimensions'].get(dimension_name, {})
    
    def get_data_source(self, source_name: str) -> Dict[str, Any]:
        """Get configuration for a specific data source"""
        return self.config['data_sources'].get(source_name, {})
    
    def get_dimensions_for_source(self, source_name: str) -> List[str]:
        """Get list of available dimensions for a data source"""
        source = self.get_data_source(source_name)
        return source.get('dimensions', [])
    
    def get_filters_for_source(self, source_name: str) -> List[str]:
        """Get list of filterable dimensions for a data source"""
        source = self.get_data_source(source_name)
        return source.get('filters', [])
    
    def get_value_fields_for_source(self, source_name: str) -> Dict[str, Dict[str, str]]:
        """Get value fields configuration for a data source"""
        source = self.get_data_source(source_name)
        return source.get('value_fields', {})
    
    def is_valid_grouping(self, dimensions: List[str], source_name: Optional[str] = None) -> bool:
        """Check if a combination of dimensions is valid for grouping"""
        # First check if dimensions are available for the source
        if source_name:
            available_dims = set(self.get_dimensions_for_source(source_name))
            if not all(dim in available_dims for dim in dimensions):
                return False
        
        # Check against valid groupings
        for grouping in self.config['valid_groupings']:
            if set(dimensions) == set(grouping['dimensions']):
                return True
        return False
    
    def get_max_items_for_grouping(self, dimensions: List[str]) -> int:
        """Get recommended maximum items for a grouping"""
        for grouping in self.config['valid_groupings']:
            if set(dimensions) == set(grouping['dimensions']):
                return grouping.get('max_items', 1000)
        return 1000  # default
    
    def get_abbreviation(self, dimension: str, value: str) -> str:
        """Get abbreviation for a dimension value if available"""
        dim_config = self.get_dimension(dimension)
        abbreviations = dim_config.get('abbreviations', {})
        return abbreviations.get(value, value)
    
    def generate_aggregation_code(self, source_name: str, dimensions: List[str], 
                                 value_field: str) -> str:
        """Generate pandas aggregation code for given dimensions"""
        # This is a template - actual implementation would be more sophisticated
        dim_fields = [self.get_dimension(d)['field'] for d in dimensions]
        
        code = f"""
# Auto-generated aggregation for {source_name}
grouped = df.groupby({dim_fields}).agg({{
    '{value_field}': 'sum',
    'record_count': 'size'
}}).reset_index()
"""
        return code
    
    def get_ui_settings(self) -> Dict[str, Any]:
        """Get UI configuration settings"""
        return self.config.get('ui_settings', {})
    
    def get_all_data_sources(self) -> Dict[str, Dict[str, Any]]:
        """Get all data source configurations"""
        return self.config['data_sources']
    
    def get_dimension_field_mapping(self, source_name: str) -> Dict[str, str]:
        """Get mapping of dimension names to field names for a data source"""
        mapping = {}
        for dim in self.get_dimensions_for_source(source_name):
            dim_config = self.get_dimension(dim)
            mapping[dim] = dim_config.get('field', dim)
        return mapping


# Convenience function for scripts
_config_instance = None

def get_config() -> DataConfig:
    """Get singleton config instance"""
    global _config_instance
    if _config_instance is None:
        _config_instance = DataConfig()
    return _config_instance


if __name__ == "__main__":
    # Test the config loader
    config = DataConfig()
    
    print("Available data sources:")
    for source_name, source_config in config.get_all_data_sources().items():
        print(f"\n{source_name}:")
        print(f"  File: {source_config['file']}")
        print(f"  Dimensions: {', '.join(config.get_dimensions_for_source(source_name))}")
        print(f"  Filters: {', '.join(config.get_filters_for_source(source_name))}")
        
    # Test grouping validation
    print("\n\nTesting grouping validation:")
    test_groupings = [
        ['component'],
        ['component', 'fund_type'],
        ['component', 'fund_type', 'budget_category'],
        ['component', 'invalid_dimension']
    ]
    
    for grouping in test_groupings:
        valid = config.is_valid_grouping(grouping, 'apportionment')
        print(f"  {grouping}: {'✓ Valid' if valid else '✗ Invalid'}")