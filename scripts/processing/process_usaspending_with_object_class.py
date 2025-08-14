#!/usr/bin/env python3
"""
Enhanced USAspending processor that includes Program Activity and Object Class breakdowns.
Processes both AccountBalances and PA-OC files to show where money is spent.
"""

import pandas as pd
import json
import glob
import os
from datetime import datetime
from collections import defaultdict

# Object Class Categories for grouping spending types
OBJECT_CLASS_CATEGORIES = {
    'Personnel Compensation': {
        'codes': ['11.1', '11.3', '11.5', '11.7', '11.8', '11.9'],
        'description': 'Salaries and wages'
    },
    'Personnel Benefits': {
        'codes': ['12.1', '12.2', '13.0'],
        'description': 'Benefits for current and former personnel'
    },
    'Travel & Transportation': {
        'codes': ['21.0', '22.0'],
        'description': 'Travel and transportation of persons and things'
    },
    'Rent & Utilities': {
        'codes': ['23.1', '23.2', '23.3'],
        'description': 'Rent, communications, and utilities'
    },
    'Other Services': {
        'codes': ['24.0', '25.1', '25.2', '25.3', '25.4', '25.5', '25.6', '25.7', '25.8'],
        'description': 'Printing, consulting, contracts, and other services'
    },
    'Supplies & Equipment': {
        'codes': ['26.0', '31.0'],
        'description': 'Supplies, materials, and equipment'
    },
    'Grants & Fixed Charges': {
        'codes': ['41.0', '42.0', '43.0', '44.0'],
        'description': 'Grants, subsidies, and fixed charges'
    },
    'Other': {
        'codes': ['32.0', '33.0', '91.0', '92.0', '93.0', '94.0'],
        'description': 'Land, investments, and other'
    }
}

def categorize_object_class(object_class_code):
    """Categorize an object class code into a broader category"""
    if pd.isna(object_class_code):
        return 'Unknown'
    
    code_str = str(object_class_code).strip()
    
    for category, info in OBJECT_CLASS_CATEGORIES.items():
        if code_str in info['codes']:
            return category
    
    # Check if it's a personnel code (11.x or 12.x pattern)
    if code_str.startswith('11.'):
        return 'Personnel Compensation'
    elif code_str.startswith('12.') or code_str.startswith('13.'):
        return 'Personnel Benefits'
    elif code_str.startswith('21.') or code_str.startswith('22.'):
        return 'Travel & Transportation'
    elif code_str.startswith('23.'):
        return 'Rent & Utilities'
    elif code_str.startswith('25.'):
        return 'Other Services'
    elif code_str.startswith('26.') or code_str.startswith('31.'):
        return 'Supplies & Equipment'
    elif code_str.startswith('41.') or code_str.startswith('42.') or code_str.startswith('43.') or code_str.startswith('44.'):
        return 'Grants & Fixed Charges'
    
    return 'Other'

class USAspendingProcessor:
    def __init__(self):
        self.apportionment_data = None
        self.processed_data = {
            'metadata': {
                'processed_at': datetime.now().isoformat(),
                'source_files': [],
                'validation_summary': {},
                'object_class_categories': OBJECT_CLASS_CATEGORIES
            },
            'data_by_year': {},
            'object_class_by_year': {},
            'validation_details': {
                'tas_validation': {},
                'agency_validation': {},
                'component_validation': {}
            }
        }
    
    def load_apportionment_data(self):
        """Load apportionment data for validation"""
        print("Loading apportionment data...")
        self.apportionment_data = pd.read_csv('processed_data/appropriations/dhs_tas_aggregated_with_fund_types.csv')
        
        # Extract unique values for validation
        self.valid_tas = set(self.apportionment_data['tas'].unique())
        self.valid_bureaus = set(self.apportionment_data['bureau'].unique())
        self.valid_accounts = set(self.apportionment_data['account'].unique())
        
        print(f"Loaded {len(self.apportionment_data)} apportionment records")
        print(f"  - Unique TAS codes: {len(self.valid_tas)}")
        print(f"  - Unique bureaus: {len(self.valid_bureaus)}")
        print(f"  - Unique accounts: {len(self.valid_accounts)}")
    
    def find_usaspending_files(self):
        """Find all USAspending CSV files we need"""
        files = {
            'account_balances': [],
            'pa_oc': []
        }
        
        # Find AccountBalances files
        ab_pattern = 'raw_data/usaspending/FY*/FY*_All_TAS_AccountBalances*.csv'
        files['account_balances'] = sorted(glob.glob(ab_pattern))
        
        # Find PA-OC files
        pa_oc_pattern = 'raw_data/usaspending/FY*/FY*_All_TAS_AccountBreakdownByPA-OC*.csv'
        files['pa_oc'] = sorted(glob.glob(pa_oc_pattern))
        
        print(f"Found {len(files['account_balances'])} AccountBalances files")
        print(f"Found {len(files['pa_oc'])} PA-OC breakdown files")
        
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
        """Extract component from treasury account name"""
        if not treasury_account_name:
            return "Unknown"
        
        # Component mapping (same as before)
        component_keywords = {
            'Customs and Border Protection': ['Customs and Border Protection', 'CBP'],
            'Immigration and Customs Enforcement': ['Immigration and Customs Enforcement', 'ICE'],
            'Transportation Security Administration': ['Transportation Security Administration', 'TSA'],
            'Coast Guard': ['Coast Guard', 'USCG'],
            'Federal Emergency Management Agency': ['Federal Emergency Management Agency', 'FEMA'],
            'Cybersecurity and Infrastructure Security Agency': ['Cybersecurity', 'CISA'],
            'Secret Service': ['Secret Service', 'USSS'],
            'Citizenship and Immigration Services': ['Citizenship and Immigration', 'USCIS'],
            'Science and Technology': ['Science and Technology', 'S&T'],
            'Analysis and Operations': ['Analysis and Operations', 'I&A'],
            'Federal Law Enforcement Training Centers': ['Federal Law Enforcement Training', 'FLETC'],
            'Countering Weapons of Mass Destruction': ['Countering Weapons of Mass Destruction', 'CWMD'],
            'Management Directorate': ['Management Directorate'],
            'Office of Inspector General': ['Inspector General', 'OIG']
        }
        
        name_lower = treasury_account_name.lower()
        
        for component, keywords in component_keywords.items():
            for keyword in keywords:
                if keyword.lower() in name_lower:
                    return component
        
        return "Unknown"
    
    def process_account_balances(self, filepath, fiscal_year):
        """Process an AccountBalances file"""
        print(f"\nProcessing AccountBalances: {filepath}")
        
        df = pd.read_csv(filepath)
        print(f"  Loaded {len(df)} records")
        
        # Initialize data structure for this file
        file_data = {
            'filename': os.path.basename(filepath),
            'fiscal_year': fiscal_year,
            'record_count': len(df),
            'accounts': [],
            'validation_stats': {
                'total_records': len(df),
                'valid_tas': 0,
                'invalid_tas': 0,
                'matched_components': 0,
                'unknown_components': 0,
                'tas_not_in_apportionment': [],
                'components_not_in_apportionment': []
            }
        }
        
        # Process each record
        for idx, row in df.iterrows():
            # Parse TAS
            tas_full = row.get('treasury_account_symbol', '')
            tas_simple = self.parse_tas(tas_full)
            
            # Validate TAS
            if tas_simple and tas_simple in self.valid_tas:
                file_data['validation_stats']['valid_tas'] += 1
            else:
                file_data['validation_stats']['invalid_tas'] += 1
                if tas_simple and tas_simple not in file_data['validation_stats']['tas_not_in_apportionment']:
                    file_data['validation_stats']['tas_not_in_apportionment'].append(tas_simple)
            
            # Extract component
            treasury_account_name = row.get('treasury_account_name', '')
            component = self.extract_component(treasury_account_name)
            
            # Validate component
            if component != "Unknown":
                file_data['validation_stats']['matched_components'] += 1
            else:
                file_data['validation_stats']['unknown_components'] += 1
                if treasury_account_name and treasury_account_name not in file_data['validation_stats']['components_not_in_apportionment']:
                    file_data['validation_stats']['components_not_in_apportionment'].append(treasury_account_name)
            
            # Create record
            record = {
                'tas': tas_simple,
                'tas_full': tas_full,
                'component': component,
                'treasury_account_name': treasury_account_name,
                'beginning_period': row.get('beginning_period_of_availability'),
                'ending_period': row.get('ending_period_of_availability'),
                'budget_authority': float(row.get('budget_authority_appropriated_amount', 0) or 0),
                'obligations': float(row.get('obligations_incurred', 0) or 0),
                'outlays': float(row.get('gross_outlay_amount', 0) or 0),
                'unobligated_balance': float(row.get('unobligated_balance', 0) or 0)
            }
            
            file_data['accounts'].append(record)
        
        # Print validation summary
        print(f"  Validation Summary:")
        print(f"    - Valid TAS: {file_data['validation_stats']['valid_tas']}/{file_data['validation_stats']['total_records']}")
        print(f"    - Matched Components: {file_data['validation_stats']['matched_components']}/{file_data['validation_stats']['total_records']}")
        
        return file_data
    
    def process_pa_oc_file(self, filepath, fiscal_year):
        """Process a Program Activity & Object Class breakdown file"""
        print(f"\nProcessing PA-OC breakdown: {filepath}")
        
        df = pd.read_csv(filepath)
        print(f"  Loaded {len(df)} records")
        
        # Group by TAS and aggregate by object class category
        tas_breakdowns = defaultdict(lambda: {
            'tas': None,
            'component': None,
            'program_activities': defaultdict(lambda: defaultdict(float)),
            'object_class_categories': defaultdict(float),
            'object_class_details': defaultdict(float),
            'total_obligations': 0,
            'total_outlays': 0
        })
        
        for idx, row in df.iterrows():
            # Parse TAS
            tas_full = row.get('treasury_account_symbol', '')
            tas_simple = self.parse_tas(tas_full)
            
            if not tas_simple:
                continue
            
            # Get component
            treasury_account_name = row.get('treasury_account_name', '')
            component = self.extract_component(treasury_account_name)
            
            # Get program activity and object class
            program_activity = row.get('program_activity_name', 'Unknown')
            object_class_code = row.get('object_class_code', '')
            object_class_name = row.get('object_class_name', 'Unknown')
            
            # Get amounts
            obligations = float(row.get('obligations_incurred', 0) or 0)
            outlays = float(row.get('gross_outlay_amount_FYB_to_period_end', 0) or 0)
            
            # Categorize object class
            category = categorize_object_class(object_class_code)
            
            # Update breakdown
            breakdown = tas_breakdowns[tas_simple]
            breakdown['tas'] = tas_simple
            breakdown['component'] = component
            
            # By program activity and category
            breakdown['program_activities'][program_activity][category] += obligations
            
            # By category (across all program activities)
            breakdown['object_class_categories'][category] += obligations
            
            # Detailed object class
            breakdown['object_class_details'][f"{object_class_code} - {object_class_name}"] += obligations
            
            # Totals
            breakdown['total_obligations'] += obligations
            breakdown['total_outlays'] += outlays
        
        # Convert to list and calculate percentages
        breakdowns_list = []
        for tas, breakdown in tas_breakdowns.items():
            # Calculate category percentages
            if breakdown['total_obligations'] > 0:
                breakdown['category_percentages'] = {
                    cat: (amount / breakdown['total_obligations'] * 100)
                    for cat, amount in breakdown['object_class_categories'].items()
                }
                
                # Calculate personnel vs non-personnel
                personnel_total = (
                    breakdown['object_class_categories'].get('Personnel Compensation', 0) +
                    breakdown['object_class_categories'].get('Personnel Benefits', 0)
                )
                breakdown['personnel_percentage'] = personnel_total / breakdown['total_obligations'] * 100
                breakdown['non_personnel_percentage'] = 100 - breakdown['personnel_percentage']
            
            breakdowns_list.append(dict(breakdown))
        
        print(f"  Processed {len(breakdowns_list)} unique TAS codes")
        
        # Show sample breakdown
        if breakdowns_list:
            sample = max(breakdowns_list, key=lambda x: x['total_obligations'])
            print(f"\n  Sample breakdown for {sample['tas']} ({sample['component']}):")
            print(f"    Total obligations: ${sample['total_obligations']:,.0f}")
            print(f"    Personnel: {sample.get('personnel_percentage', 0):.1f}%")
            for cat, pct in sorted(sample.get('category_percentages', {}).items(), key=lambda x: x[1], reverse=True)[:5]:
                print(f"    - {cat}: {pct:.1f}%")
        
        return breakdowns_list
    
    def process_files(self):
        """Process all USAspending files"""
        files = self.find_usaspending_files()
        
        if not files['account_balances']:
            print("\nNo USAspending files found!")
            return
        
        # Process AccountBalances files
        print("\n=== Processing Account Balances ===")
        for filepath in files['account_balances']:
            # Extract fiscal year from filename
            filename = os.path.basename(filepath)
            fy_match = filename[:6]  # e.g., "FY2023"
            fiscal_year = fy_match[2:] if fy_match.startswith('FY') else 'Unknown'
            
            if fiscal_year not in self.processed_data['data_by_year']:
                self.processed_data['data_by_year'][fiscal_year] = []
            
            file_data = self.process_account_balances(filepath, fiscal_year)
            self.processed_data['data_by_year'][fiscal_year].append(file_data)
            self.processed_data['metadata']['source_files'].append(filepath)
        
        # Process PA-OC files
        print("\n=== Processing Object Class Breakdowns ===")
        for filepath in files['pa_oc']:
            # Extract fiscal year from filename
            filename = os.path.basename(filepath)
            fy_match = filename[:6]  # e.g., "FY2023"
            fiscal_year = fy_match[2:] if fy_match.startswith('FY') else 'Unknown'
            
            if fiscal_year not in self.processed_data['object_class_by_year']:
                self.processed_data['object_class_by_year'][fiscal_year] = []
            
            breakdowns = self.process_pa_oc_file(filepath, fiscal_year)
            self.processed_data['object_class_by_year'][fiscal_year] = breakdowns
            self.processed_data['metadata']['source_files'].append(filepath)
    
    def generate_summary(self):
        """Generate overall summary statistics"""
        print("\n=== OVERALL SUMMARY ===")
        
        # Account balances summary
        total_records = 0
        total_valid_tas = 0
        
        for year, year_data in self.processed_data['data_by_year'].items():
            year_records = 0
            year_valid_tas = 0
            
            for file_data in year_data:
                year_records += file_data['validation_stats']['total_records']
                year_valid_tas += file_data['validation_stats']['valid_tas']
            
            total_records += year_records
            total_valid_tas += year_valid_tas
            
            print(f"\nFiscal Year {year}:")
            print(f"  - Total records: {year_records:,}")
            print(f"  - Valid TAS: {year_valid_tas:,} ({year_valid_tas/year_records*100:.1f}%)")
        
        # Object class summary
        print("\n=== Object Class Analysis ===")
        for year, breakdowns in self.processed_data['object_class_by_year'].items():
            if breakdowns:
                total_obligations = sum(b['total_obligations'] for b in breakdowns)
                personnel_total = sum(
                    b['object_class_categories'].get('Personnel Compensation', 0) +
                    b['object_class_categories'].get('Personnel Benefits', 0)
                    for b in breakdowns
                )
                
                print(f"\nFiscal Year {year}:")
                print(f"  - Total obligations: ${total_obligations/1e9:.2f}B")
                print(f"  - Personnel costs: ${personnel_total/1e9:.2f}B ({personnel_total/total_obligations*100:.1f}%)")
                print(f"  - Non-personnel costs: ${(total_obligations-personnel_total)/1e9:.2f}B ({(total_obligations-personnel_total)/total_obligations*100:.1f}%)")
    
    def save_results(self):
        """Save processed data to JSON"""
        output_file = 'processed_data/usaspending/usaspending_with_object_class.json'
        
        # Ensure directory exists
        os.makedirs(os.path.dirname(output_file), exist_ok=True)
        
        # Convert defaultdicts to regular dicts for JSON serialization
        def convert_defaultdict(d):
            if isinstance(d, defaultdict):
                d = {k: convert_defaultdict(v) for k, v in d.items()}
            return d
        
        # Clean up the data for JSON
        clean_data = json.loads(json.dumps(self.processed_data, default=str))
        
        with open(output_file, 'w') as f:
            json.dump(clean_data, f, indent=2)
        
        print(f"\n=== Results saved to {output_file} ===")
        
        # Also save a summary CSV for the object class breakdown
        summary_records = []
        for year, breakdowns in self.processed_data['object_class_by_year'].items():
            for b in breakdowns:
                summary_records.append({
                    'fiscal_year': year,
                    'tas': b['tas'],
                    'component': b['component'],
                    'total_obligations': b['total_obligations'],
                    'personnel_compensation': b['object_class_categories'].get('Personnel Compensation', 0),
                    'personnel_benefits': b['object_class_categories'].get('Personnel Benefits', 0),
                    'travel_transportation': b['object_class_categories'].get('Travel & Transportation', 0),
                    'rent_utilities': b['object_class_categories'].get('Rent & Utilities', 0),
                    'other_services': b['object_class_categories'].get('Other Services', 0),
                    'supplies_equipment': b['object_class_categories'].get('Supplies & Equipment', 0),
                    'grants_fixed_charges': b['object_class_categories'].get('Grants & Fixed Charges', 0),
                    'other': b['object_class_categories'].get('Other', 0),
                    'personnel_percentage': b.get('personnel_percentage', 0)
                })
        
        if summary_records:
            summary_df = pd.DataFrame(summary_records)
            # Convert fiscal_year to int
            summary_df['fiscal_year'] = summary_df['fiscal_year'].astype(int)
            summary_file = 'processed_data/usaspending/object_class_summary.csv'
            summary_df.to_csv(summary_file, index=False)
            print(f"Object class summary saved to {summary_file}")
    
    def run(self):
        """Run the complete processing pipeline"""
        # Load apportionment data
        self.load_apportionment_data()
        
        # Process all files
        self.process_files()
        
        # Generate summary
        self.generate_summary()
        
        # Save results
        self.save_results()

if __name__ == "__main__":
    processor = USAspendingProcessor()
    processor.run()