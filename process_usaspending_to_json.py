#!/usr/bin/env python3
"""
Process all USAspending downloads into a consolidated JSON format
and validate fields against apportionment data.
"""

import pandas as pd
import json
import glob
import os
from datetime import datetime
from collections import defaultdict

class USAspendingProcessor:
    def __init__(self):
        self.apportionment_data = None
        self.processed_data = {
            'metadata': {
                'processed_at': datetime.now().isoformat(),
                'source_files': [],
                'validation_summary': {}
            },
            'data_by_year': {},
            'validation_details': {
                'tas_validation': {},
                'agency_validation': {},
                'component_validation': {}
            }
        }
    
    def load_apportionment_data(self):
        """Load apportionment data for validation"""
        print("Loading apportionment data...")
        self.apportionment_data = pd.read_csv('data/dhs_tas_aggregated_with_fund_types.csv')
        
        # Extract unique values for validation
        self.valid_tas = set(self.apportionment_data['tas'].unique())
        self.valid_bureaus = set(self.apportionment_data['bureau'].unique())
        self.valid_accounts = set(self.apportionment_data['account'].unique())
        
        print(f"Loaded {len(self.apportionment_data)} apportionment records")
        print(f"  - Unique TAS codes: {len(self.valid_tas)}")
        print(f"  - Unique bureaus: {len(self.valid_bureaus)}")
        print(f"  - Unique accounts: {len(self.valid_accounts)}")
    
    def find_usaspending_files(self):
        """Find all USAspending AccountBalances CSV files"""
        patterns = [
            'FY*_All_TAS_AccountData*/FY*_All_TAS_AccountBalances*.csv',
            'usaspending_data/FY*/FY*_All_TAS_AccountBalances*.csv',
            'usaspending_api_data/*/FY*_All_TAS_AccountBalances*.csv'
        ]
        
        files = []
        for pattern in patterns:
            found = glob.glob(pattern, recursive=True)
            files.extend(found)
        
        # Remove duplicates and sort
        files = sorted(list(set(files)))
        
        print(f"\nFound {len(files)} USAspending files:")
        for f in files:
            print(f"  - {f}")
        
        return files
    
    def parse_tas(self, tas_string):
        """Parse TAS from USAspending format to match apportionment format"""
        if not tas_string:
            return None
        
        # Format: 070-2024/2024-0112-000
        parts = tas_string.split('-')
        if len(parts) >= 3:
            agency = parts[0]
            main_account = parts[2].split('-')[0] if '/' in parts[1] else parts[1]
            return f"{agency}-{main_account}"
        
        return None
    
    def extract_component(self, treasury_account_name):
        """Extract component name from treasury account name"""
        if not treasury_account_name:
            return "Unknown"
        
        # Common patterns
        component_keywords = {
            'Customs and Border Protection': ['Customs and Border Protection', 'CBP'],
            'Immigration and Customs Enforcement': ['Immigration and Customs Enforcement', 'ICE'],
            'Transportation Security Administration': ['Transportation Security Administration', 'TSA'],
            'Coast Guard': ['Coast Guard', 'USCG'],
            'Secret Service': ['Secret Service', 'USSS'],
            'Federal Emergency Management Agency': ['Federal Emergency Management Agency', 'FEMA'],
            'Cybersecurity and Infrastructure Security Agency': ['Cybersecurity and Infrastructure Security Agency', 'CISA'],
            'Citizenship and Immigration Services': ['Citizenship and Immigration Services', 'USCIS'],
            'Science and Technology': ['Science and Technology'],
            'Management Directorate': ['Management Directorate'],
            'Federal Law Enforcement Training': ['Federal Law Enforcement Training'],
            'Inspector General': ['Inspector General'],
            'Countering Weapons of Mass Destruction': ['Countering Weapons of Mass Destruction', 'CWMD']
        }
        
        for component, keywords in component_keywords.items():
            for keyword in keywords:
                if keyword.lower() in treasury_account_name.lower():
                    return component
        
        # Try to extract from comma-separated format
        if ',' in treasury_account_name:
            parts = treasury_account_name.split(',')
            if len(parts) > 1:
                # Usually the component is second to last
                return parts[-2].strip()
        
        return "Unknown"
    
    def process_file(self, filepath):
        """Process a single USAspending file"""
        print(f"\nProcessing: {filepath}")
        
        # Extract metadata from filename
        filename = os.path.basename(filepath)
        try:
            # Extract fiscal year
            fy_parts = filename.split('FY')
            if len(fy_parts) > 1:
                fiscal_year = fy_parts[1][:4]
            else:
                fiscal_year = "Unknown"
            
            # Extract period
            if 'P' in filename:
                period_parts = filename.split('P')
                if len(period_parts) > 1 and '-' in period_parts[1]:
                    period_start = period_parts[1].split('-')[0]
                    period_end = period_parts[1].split('-')[1].split('_')[0]
                    period = f"P{period_start}-P{period_end}"
                else:
                    period = "Unknown"
            else:
                period = "Unknown"
        except Exception as e:
            print(f"  Warning: Could not parse filename metadata: {e}")
            fiscal_year = "Unknown"
            period = "Unknown"
        
        # Read the CSV
        try:
            df = pd.read_csv(filepath)
            print(f"  Loaded {len(df)} records")
        except Exception as e:
            print(f"  ERROR: Could not read file: {e}")
            return None
        
        # Initialize counters
        validation_stats = {
            'total_records': len(df),
            'valid_tas': 0,
            'invalid_tas': 0,
            'matched_components': 0,
            'unknown_components': 0,
            'tas_not_in_apportionment': [],
            'components_not_in_apportionment': []
        }
        
        # Process each record
        records = []
        for idx, row in df.iterrows():
            # Parse TAS
            tas_full = row.get('treasury_account_symbol', '')
            tas_simple = self.parse_tas(tas_full)
            
            # Validate TAS
            if tas_simple and tas_simple in self.valid_tas:
                validation_stats['valid_tas'] += 1
            else:
                validation_stats['invalid_tas'] += 1
                if tas_simple and tas_simple not in validation_stats['tas_not_in_apportionment']:
                    validation_stats['tas_not_in_apportionment'].append(tas_simple)
            
            # Extract component
            treasury_account_name = row.get('treasury_account_name', '')
            component = self.extract_component(treasury_account_name)
            
            # Validate component
            if component != "Unknown":
                validation_stats['matched_components'] += 1
                # Check if component matches any bureau (with normalization)
                component_normalized = component.replace('U.S. ', '')
                bureau_match = False
                for bureau in self.valid_bureaus:
                    bureau_normalized = bureau.replace('U.S. ', '')
                    if (component_normalized.lower() in bureau_normalized.lower() or 
                        bureau_normalized.lower() in component_normalized.lower()):
                        bureau_match = True
                        break
                
                if not bureau_match and component not in validation_stats['components_not_in_apportionment']:
                    validation_stats['components_not_in_apportionment'].append(component)
            else:
                validation_stats['unknown_components'] += 1
            
            # Create record
            record = {
                'tas_full': tas_full,
                'tas_simple': tas_simple,
                'component': component,
                'treasury_account_name': treasury_account_name,
                'agency_code': row.get('agency_identifier_code', ''),
                'main_account_code': row.get('main_account_code', ''),
                'sub_account_code': row.get('sub_account_code', ''),
                'beginning_period': row.get('beginning_period_of_availability', ''),
                'ending_period': row.get('ending_period_of_availability', ''),
                'budget_authority': row.get('budget_authority_appropriated_amount', 0) or 0,
                'obligations': row.get('obligations_incurred', 0) or 0,
                'outlays': row.get('gross_outlay_amount', 0) or 0,
                'unobligated_balance': row.get('unobligated_balance', 0) or 0
            }
            
            records.append(record)
        
        # Store file data
        file_data = {
            'source_file': filepath,
            'fiscal_year': fiscal_year,
            'period': period,
            'record_count': len(records),
            'validation_stats': validation_stats,
            'records': records
        }
        
        # Add to processed data
        if fiscal_year not in self.processed_data['data_by_year']:
            self.processed_data['data_by_year'][fiscal_year] = []
        
        self.processed_data['data_by_year'][fiscal_year].append(file_data)
        self.processed_data['metadata']['source_files'].append(filepath)
        
        # Print validation summary
        print(f"  Validation Summary:")
        print(f"    - Valid TAS: {validation_stats['valid_tas']}/{validation_stats['total_records']}")
        print(f"    - Matched Components: {validation_stats['matched_components']}/{validation_stats['total_records']}")
        print(f"    - Unknown Components: {validation_stats['unknown_components']}")
        print(f"    - TAS not in apportionment: {len(validation_stats['tas_not_in_apportionment'])}")
        print(f"    - Components not in apportionment: {len(validation_stats['components_not_in_apportionment'])}")
        
        return file_data
    
    def generate_summary(self):
        """Generate overall summary statistics"""
        print("\n=== OVERALL SUMMARY ===")
        
        total_records = 0
        total_valid_tas = 0
        total_matched_components = 0
        all_invalid_tas = set()
        all_unmatched_components = set()
        
        for year, year_data in self.processed_data['data_by_year'].items():
            year_records = 0
            year_valid_tas = 0
            year_matched_components = 0
            
            for file_data in year_data:
                stats = file_data['validation_stats']
                year_records += stats['total_records']
                year_valid_tas += stats['valid_tas']
                year_matched_components += stats['matched_components']
                all_invalid_tas.update(stats['tas_not_in_apportionment'])
                all_unmatched_components.update(stats['components_not_in_apportionment'])
            
            total_records += year_records
            total_valid_tas += year_valid_tas
            total_matched_components += year_matched_components
            
            print(f"\nFiscal Year {year}:")
            print(f"  - Total records: {year_records:,}")
            print(f"  - Valid TAS: {year_valid_tas:,} ({year_valid_tas/year_records*100:.1f}%)")
            print(f"  - Matched components: {year_matched_components:,} ({year_matched_components/year_records*100:.1f}%)")
        
        # Store summary
        self.processed_data['metadata']['validation_summary'] = {
            'total_records_processed': total_records,
            'total_valid_tas': total_valid_tas,
            'tas_validation_rate': total_valid_tas / total_records * 100 if total_records > 0 else 0,
            'total_matched_components': total_matched_components,
            'component_match_rate': total_matched_components / total_records * 100 if total_records > 0 else 0,
            'unique_invalid_tas': len(all_invalid_tas),
            'unique_unmatched_components': len(all_unmatched_components)
        }
        
        print(f"\nOverall:")
        print(f"  - Total records: {total_records:,}")
        print(f"  - TAS validation rate: {self.processed_data['metadata']['validation_summary']['tas_validation_rate']:.1f}%")
        print(f"  - Component match rate: {self.processed_data['metadata']['validation_summary']['component_match_rate']:.1f}%")
        print(f"  - Unique invalid TAS: {len(all_invalid_tas)}")
        print(f"  - Unique unmatched components: {len(all_unmatched_components)}")
        
        # Show sample of unmatched items
        if all_invalid_tas:
            print(f"\nSample invalid TAS (first 10):")
            for tas in list(all_invalid_tas)[:10]:
                print(f"    - {tas}")
        
        if all_unmatched_components:
            print(f"\nUnmatched components:")
            for comp in sorted(all_unmatched_components):
                print(f"    - {comp}")
    
    def save_results(self):
        """Save processed data to JSON"""
        # Save full data
        output_file = 'usaspending_processed_data.json'
        with open(output_file, 'w') as f:
            json.dump(self.processed_data, f, indent=2)
        
        print(f"\n=== Results saved to {output_file} ===")
        
        # Also save a summary without the full records for easier viewing
        summary_data = {
            'metadata': self.processed_data['metadata'],
            'files_by_year': {}
        }
        
        for year, year_data in self.processed_data['data_by_year'].items():
            summary_data['files_by_year'][year] = []
            for file_data in year_data:
                summary_data['files_by_year'][year].append({
                    'source_file': file_data['source_file'],
                    'period': file_data['period'],
                    'record_count': file_data['record_count'],
                    'validation_stats': file_data['validation_stats']
                })
        
        summary_file = 'usaspending_validation_summary.json'
        with open(summary_file, 'w') as f:
            json.dump(summary_data, f, indent=2)
        
        print(f"Summary saved to {summary_file}")
    
    def run(self):
        """Run the complete processing pipeline"""
        # Load apportionment data
        self.load_apportionment_data()
        
        # Find and process USAspending files
        files = self.find_usaspending_files()
        
        if not files:
            print("\nNo USAspending files found!")
            return
        
        # Process each file
        for filepath in files:
            self.process_file(filepath)
        
        # Generate summary
        self.generate_summary()
        
        # Save results
        self.save_results()


if __name__ == "__main__":
    processor = USAspendingProcessor()
    processor.run()