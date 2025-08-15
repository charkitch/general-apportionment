#!/usr/bin/env python3
"""
Load configuration from YAML for Python processing scripts
"""

import yaml
import os

class ConfigLoader:
    def __init__(self, config_path='config/data_schema.yaml'):
        self.config_path = config_path
        self.config = None
        self.load_config()
    
    def load_config(self):
        """Load configuration from YAML file"""
        config_file = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), self.config_path)
        
        with open(config_file, 'r') as f:
            self.config = yaml.safe_load(f)
    
    def get_fiscal_years(self):
        """Get fiscal years to process"""
        return self.config.get('analysis_settings', {}).get('data_processing', {}).get('fiscal_years_to_load', ['FY2023', 'FY2025'])
    
    def get_comparison_years(self):
        """Get years for comparison analysis"""
        settings = self.config.get('analysis_settings', {}).get('comparison_years', {})
        return {
            'current': settings.get('current', 2025),
            'previous': settings.get('previous', 2023)
        }
    
    def get_vendor_settings(self):
        """Get vendor analysis settings"""
        return self.config.get('analysis_settings', {}).get('vendor_analysis', {})
    
    def get_component_abbreviations(self):
        """Get component name abbreviations"""
        return self.config.get('dimensions', {}).get('component', {}).get('abbreviations', {})
    
    def get_processing_settings(self):
        """Get data processing settings"""
        return self.config.get('analysis_settings', {}).get('data_processing', {})
    
    def should_use_abbreviations(self, context='label'):
        """Check if component abbreviations should be used in context"""
        use_in = self.config.get('display_standards', {}).get('use_abbreviations_in', {})
        return use_in.get(context, True)
    
    def get_standardized_value(self, dimension, value):
        """Get standardized display value"""
        standards = self.config.get('display_standards', {}).get('standardized_values', {})
        dim_standards = standards.get(dimension, {})
        return dim_standards.get(value, value)
    
    def standardize_availability_type(self, value):
        """Standardize availability type values"""
        return self.get_standardized_value('availability_type', value)
    
    def standardize_fund_type(self, value):
        """Standardize fund type values"""
        return self.get_standardized_value('fund_type', value)

# Create singleton instance
config = ConfigLoader()