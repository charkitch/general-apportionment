#!/usr/bin/env python3
"""
Standalone script to process USAspending TAS data and validate against existing apportionment data.
This script is designed to work independently without modifying existing code.
"""

import pandas as pd
import re
from pathlib import Path
from datetime import datetime
import json


class USAspendingTASValidator:
    def __init__(self, usaspending_path, apportionment_path):
        self.usaspending_path = Path(usaspending_path)
        self.apportionment_path = Path(apportionment_path)
        self.validation_results = {
            'timestamp': datetime.now().isoformat(),
            'usaspending_file': str(usaspending_path),
            'apportionment_file': str(apportionment_path),
            'matches': [],
            'mismatches': [],
            'usaspending_only': [],
            'apportionment_only': [],
            'summary': {}
        }
    
    def parse_usaspending_tas(self, tas_string):
        """
        Parse USAspending TAS format: 070-2024/2024-0112-000
        Returns normalized components
        """
        if pd.isna(tas_string):
            return None
            
        # Pattern: agency-begin_year/end_year-main_account-sub_account
        pattern = r'(\d{3})-(\d{4})/(\d{4})-(\d{4})-(\d{3})'
        match = re.match(pattern, tas_string)
        
        if match:
            agency, begin_year, end_year, main_account, sub_account = match.groups()
            return {
                'agency': agency,
                'begin_year': begin_year,
                'end_year': end_year,
                'main_account': main_account,
                'sub_account': sub_account,
                'normalized_tas': f"{agency}-{main_account}",
                'full_tas': tas_string
            }
        return None
    
    def parse_apportionment_tas(self, tas_string):
        """
        Parse apportionment TAS format: 070-0112
        """
        if pd.isna(tas_string):
            return None
            
        parts = tas_string.split('-')
        if len(parts) == 2:
            return {
                'agency': parts[0],
                'main_account': parts[1],
                'normalized_tas': tas_string
            }
        return None
    
    def load_and_process_usaspending(self):
        """Load USAspending data and extract unique TAS codes"""
        print(f"Loading USAspending data from {self.usaspending_path}")
        
        # Find the AccountBalances file
        account_balance_files = list(self.usaspending_path.glob("*AccountBalances*.csv"))
        if not account_balance_files:
            raise FileNotFoundError("No AccountBalances file found in USAspending directory")
        
        df = pd.read_csv(account_balance_files[0])
        print(f"Loaded {len(df)} records from USAspending")
        
        # Parse TAS codes
        tas_data = []
        for _, row in df.iterrows():
            parsed = self.parse_usaspending_tas(row.get('treasury_account_symbol'))
            if parsed:
                parsed['treasury_account_name'] = row.get('treasury_account_name', '')
                parsed['federal_account_symbol'] = row.get('federal_account_symbol', '')
                parsed['federal_account_name'] = row.get('federal_account_name', '')
                tas_data.append(parsed)
        
        # Get unique TAS codes
        unique_tas = {}
        for tas in tas_data:
            key = tas['normalized_tas']
            if key not in unique_tas:
                unique_tas[key] = tas
        
        return unique_tas
    
    def load_and_process_apportionment(self):
        """Load apportionment data and extract unique TAS codes"""
        print(f"Loading apportionment data from {self.apportionment_path}")
        
        df = pd.read_csv(self.apportionment_path)
        print(f"Loaded {len(df)} records from apportionment data")
        
        # Get unique TAS codes
        unique_tas = {}
        for tas in df['tas'].unique():
            parsed = self.parse_apportionment_tas(tas)
            if parsed:
                unique_tas[parsed['normalized_tas']] = parsed
        
        return unique_tas
    
    def validate_tas_matches(self, usaspending_tas, apportionment_tas):
        """Compare TAS codes between datasets"""
        usa_keys = set(usaspending_tas.keys())
        app_keys = set(apportionment_tas.keys())
        
        # Find matches
        matches = usa_keys & app_keys
        for tas in matches:
            self.validation_results['matches'].append({
                'tas': tas,
                'usaspending_name': usaspending_tas[tas].get('treasury_account_name', ''),
                'federal_account': usaspending_tas[tas].get('federal_account_symbol', '')
            })
        
        # Find mismatches
        usa_only = usa_keys - app_keys
        for tas in usa_only:
            self.validation_results['usaspending_only'].append({
                'tas': tas,
                'full_tas': usaspending_tas[tas]['full_tas'],
                'name': usaspending_tas[tas].get('treasury_account_name', ''),
                'federal_account': usaspending_tas[tas].get('federal_account_symbol', '')
            })
        
        app_only = app_keys - usa_keys
        for tas in app_only:
            self.validation_results['apportionment_only'].append({
                'tas': tas
            })
        
        # Summary statistics
        self.validation_results['summary'] = {
            'total_usaspending_tas': len(usa_keys),
            'total_apportionment_tas': len(app_keys),
            'matched': len(matches),
            'usaspending_only': len(usa_only),
            'apportionment_only': len(app_only),
            'match_rate': len(matches) / len(app_keys) * 100 if app_keys else 0,
            'usaspending_match_rate': len(matches) / len(usa_keys) * 100 if usa_keys else 0,
            'usaspending_only_pct': len(usa_only) / len(usa_keys) * 100 if usa_keys else 0,
            'apportionment_only_pct': len(app_only) / len(app_keys) * 100 if app_keys else 0
        }
    
    def generate_report(self, output_path='usaspending_validation_report.json'):
        """Generate validation report"""
        print("\n=== TAS VALIDATION REPORT ===")
        print(f"\nDataset sizes:")
        print(f"  USAspending TAS codes: {self.validation_results['summary']['total_usaspending_tas']}")
        print(f"  Apportionment TAS codes: {self.validation_results['summary']['total_apportionment_tas']}")
        
        print(f"\nMatches:")
        print(f"  Total matched: {self.validation_results['summary']['matched']}")
        
        print(f"\nMatch rates:")
        print(f"  % of Apportionment TAS found in USAspending: {self.validation_results['summary']['match_rate']:.1f}%")
        print(f"  % of USAspending TAS found in Apportionment: {self.validation_results['summary']['usaspending_match_rate']:.1f}%")
        
        print(f"\nMismatches:")
        print(f"  In USAspending only: {self.validation_results['summary']['usaspending_only']} ({self.validation_results['summary']['usaspending_only_pct']:.1f}% of USAspending)")
        print(f"  In Apportionment only: {self.validation_results['summary']['apportionment_only']} ({self.validation_results['summary']['apportionment_only_pct']:.1f}% of Apportionment)")
        
        # Show examples of mismatches
        if self.validation_results['usaspending_only']:
            print(f"\nTAS codes in USAspending but NOT in Apportionment ({len(self.validation_results['usaspending_only'])} total):")
            for i, tas in enumerate(self.validation_results['usaspending_only'][:10]):
                print(f"  {i+1}. {tas['tas']}: {tas['name']}")
        
        if self.validation_results['apportionment_only']:
            print(f"\nTAS codes in Apportionment but NOT in USAspending ({len(self.validation_results['apportionment_only'])} total):")
            for i, tas in enumerate(self.validation_results['apportionment_only'][:10]):
                print(f"  {i+1}. {tas['tas']}")
        
        # Save detailed report
        with open(output_path, 'w') as f:
            json.dump(self.validation_results, f, indent=2)
        print(f"\nDetailed report saved to: {output_path}")
        
        # Also save a CSV for easy review
        matches_df = pd.DataFrame(self.validation_results['matches'])
        if not matches_df.empty:
            matches_df.to_csv('usaspending_tas_matches.csv', index=False)
            print(f"Matches saved to: usaspending_tas_matches.csv")
    
    def run(self):
        """Run the full validation process"""
        try:
            # Load and process both datasets
            usaspending_tas = self.load_and_process_usaspending()
            apportionment_tas = self.load_and_process_apportionment()
            
            # Validate matches
            self.validate_tas_matches(usaspending_tas, apportionment_tas)
            
            # Generate report
            self.generate_report()
            
        except Exception as e:
            print(f"Error during validation: {e}")
            raise


if __name__ == "__main__":
    # Configure paths
    USASPENDING_DIR = "FY2025P01-P09_All_TAS_AccountData_2025-08-12_H10M36S53426004"
    APPORTIONMENT_FILE = "data/dhs_tas_aggregated_with_fund_types.csv"
    
    # Run validation
    validator = USAspendingTASValidator(USASPENDING_DIR, APPORTIONMENT_FILE)
    validator.run()