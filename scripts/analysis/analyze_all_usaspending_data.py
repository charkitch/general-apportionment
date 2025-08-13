#!/usr/bin/env python3
"""
Analyze all available USAspending data files and compare with apportionment data
to verify accuracy and identify discrepancies.
"""

import pandas as pd
import glob
import os
from pathlib import Path
import json
from datetime import datetime

class USAspendingAnalyzer:
    def __init__(self):
        self.apportionment_data = None
        self.usaspending_files = []
        self.results = {
            'timestamp': datetime.now().isoformat(),
            'files_analyzed': [],
            'summary': {},
            'discrepancies': [],
            'by_year': {},
            'by_component': {}
        }
    
    def load_apportionment_data(self):
        """Load the apportionment data"""
        print("Loading apportionment data...")
        self.apportionment_data = pd.read_csv('data/dhs_tas_aggregated_with_fund_types.csv')
        
        # Normalize bureau names
        self.apportionment_data['bureau_normalized'] = self.apportionment_data['bureau'].str.replace('U.S. ', '')
        
        print(f"Loaded {len(self.apportionment_data)} apportionment records")
        print(f"Fiscal years: {sorted(self.apportionment_data['fiscal_year'].unique())}")
        
    def find_usaspending_files(self):
        """Find all USAspending account balance files"""
        patterns = [
            'FY*_All_TAS_AccountData*/FY*_All_TAS_AccountBalances*.csv',
            'usaspending_data/FY*/FY*_All_TAS_AccountBalances*.csv',
            'usaspending_api_data/*/FY*_All_TAS_AccountBalances*.csv'
        ]
        
        for pattern in patterns:
            files = glob.glob(pattern, recursive=True)
            self.usaspending_files.extend(files)
        
        # Remove duplicates
        self.usaspending_files = list(set(self.usaspending_files))
        
        print(f"\nFound {len(self.usaspending_files)} USAspending files:")
        for f in sorted(self.usaspending_files):
            print(f"  - {f}")
    
    def parse_usaspending_file(self, filepath):
        """Parse a USAspending file and extract key info"""
        print(f"\nProcessing: {filepath}")
        
        try:
            df = pd.read_csv(filepath)
            
            # Extract fiscal year and period from filename
            filename = os.path.basename(filepath)
            try:
                fy_match = filename.split('FY')[1][:4]
                fiscal_year = int(fy_match)
                
                # Extract period range
                period_match = filename.split('P')[1]
                if '-' in period_match:
                    period_start = int(period_match.split('-')[0])
                    period_end_str = period_match.split('-')[1].split('_')[0]
                    period_end = int(period_end_str) if period_end_str else period_start
                else:
                    period_str = period_match.split('_')[0]
                    period_start = period_end = int(period_str) if period_str else 1
            except (ValueError, IndexError) as e:
                print(f"  ERROR parsing filename: {e}")
                return None
            
            return {
                'filepath': filepath,
                'fiscal_year': fiscal_year,
                'period_start': period_start,
                'period_end': period_end,
                'data': df,
                'record_count': len(df)
            }
        except Exception as e:
            print(f"  ERROR: {e}")
            return None
    
    def analyze_file(self, file_info):
        """Analyze a single USAspending file"""
        df = file_info['data']
        fiscal_year = file_info['fiscal_year']
        
        # Filter for current year appropriations only
        current_fy_df = df[
            (df['beginning_period_of_availability'] == fiscal_year) & 
            (df['ending_period_of_availability'] == fiscal_year)
        ]
        
        # Aggregate by component
        component_summary = {}
        
        for _, row in df.iterrows():
            # Extract component name from treasury_account_name
            account_name = row.get('treasury_account_name', '')
            component = self.extract_component(account_name)
            
            if component not in component_summary:
                component_summary[component] = {
                    'budget_authority_all_years': 0,
                    'obligations_all_years': 0,
                    'outlays_all_years': 0,
                    'budget_authority_current_fy': 0,
                    'obligations_current_fy': 0,
                    'outlays_current_fy': 0,
                    'tas_count': 0
                }
            
            comp = component_summary[component]
            comp['budget_authority_all_years'] += row.get('budget_authority_appropriated_amount', 0) or 0
            comp['obligations_all_years'] += row.get('obligations_incurred', 0) or 0
            comp['outlays_all_years'] += row.get('gross_outlay_amount', 0) or 0
            comp['tas_count'] += 1
            
            # Add current FY amounts
            if row.get('beginning_period_of_availability') == fiscal_year and row.get('ending_period_of_availability') == fiscal_year:
                comp['budget_authority_current_fy'] += row.get('budget_authority_appropriated_amount', 0) or 0
                comp['obligations_current_fy'] += row.get('obligations_incurred', 0) or 0
                comp['outlays_current_fy'] += row.get('gross_outlay_amount', 0) or 0
        
        return {
            'fiscal_year': fiscal_year,
            'period': f"P{file_info['period_start']}-P{file_info['period_end']}",
            'total_records': len(df),
            'current_fy_records': len(current_fy_df),
            'components': component_summary
        }
    
    def extract_component(self, account_name):
        """Extract component name from treasury account name"""
        # Common component mappings
        component_map = {
            'Federal Emergency Management Agency': 'Federal Emergency Management Agency',
            'FEMA': 'Federal Emergency Management Agency',
            'Customs and Border Protection': 'Customs and Border Protection',
            'CBP': 'Customs and Border Protection',
            'Immigration and Customs Enforcement': 'Immigration and Customs Enforcement',
            'ICE': 'Immigration and Customs Enforcement',
            'Transportation Security Administration': 'Transportation Security Administration',
            'TSA': 'Transportation Security Administration',
            'Coast Guard': 'Coast Guard',
            'USCG': 'Coast Guard',
            'Secret Service': 'United States Secret Service',
            'Cybersecurity and Infrastructure Security Agency': 'Cybersecurity and Infrastructure Security Agency',
            'CISA': 'Cybersecurity and Infrastructure Security Agency',
            'Citizenship and Immigration Services': 'Citizenship and Immigration Services',
            'USCIS': 'Citizenship and Immigration Services',
            'Science and Technology': 'Science and Technology Directorate',
            'Inspector General': 'Office of Inspector General',
            'Analysis and Operations': 'Analysis and Operations',
            'Countering Weapons of Mass Destruction': 'Countering Weapons of Mass Destruction Office',
            'Management Directorate': 'Management Directorate',
            'Federal Law Enforcement Training': 'Federal Law Enforcement Training Centers'
        }
        
        # Check each component
        for key, value in component_map.items():
            if key in account_name:
                return value
        
        # If no match, try to extract from account name
        if ',' in account_name:
            parts = account_name.split(',')
            if len(parts) > 1:
                return parts[-2].strip()  # Usually the component is second to last
        
        return 'Unknown'
    
    def compare_with_apportionment(self, usaspending_analysis):
        """Compare USAspending data with apportionment data"""
        fiscal_year = str(usaspending_analysis['fiscal_year'])
        
        # Get apportionment data for this fiscal year
        fy_apportionment = self.apportionment_data[
            self.apportionment_data['fiscal_year'] == fiscal_year
        ]
        
        # Aggregate apportionment by component
        apportionment_by_component = fy_apportionment.groupby('bureau_normalized')['amount'].sum()
        
        comparison = []
        
        for component, usaspending_data in usaspending_analysis['components'].items():
            # Find matching apportionment
            apportionment_amount = 0
            
            # Try different name variations
            for bureau_name in apportionment_by_component.index:
                if (component in bureau_name or bureau_name in component or
                    component.replace('U.S. ', '') == bureau_name or
                    bureau_name == component.replace('U.S. ', '')):
                    apportionment_amount = apportionment_by_component[bureau_name]
                    break
            
            # Calculate ratios
            obligation_rate = 0
            if apportionment_amount > 0:
                obligation_rate = (usaspending_data['obligations_current_fy'] / apportionment_amount) * 100
            
            comparison.append({
                'component': component,
                'fiscal_year': fiscal_year,
                'apportionment': apportionment_amount,
                'obligations_current_fy': usaspending_data['obligations_current_fy'],
                'outlays_current_fy': usaspending_data['outlays_current_fy'],
                'obligations_all_years': usaspending_data['obligations_all_years'],
                'outlays_all_years': usaspending_data['outlays_all_years'],
                'obligation_rate': obligation_rate,
                'tas_count': usaspending_data['tas_count']
            })
        
        return comparison
    
    def run_analysis(self):
        """Run the complete analysis"""
        # Load data
        self.load_apportionment_data()
        self.find_usaspending_files()
        
        if not self.usaspending_files:
            print("\nNo USAspending files found!")
            return
        
        # Analyze each file
        all_comparisons = []
        
        for filepath in sorted(self.usaspending_files):
            file_info = self.parse_usaspending_file(filepath)
            if not file_info:
                continue
            
            # Analyze the file
            analysis = self.analyze_file(file_info)
            
            # Compare with apportionment
            comparison = self.compare_with_apportionment(analysis)
            
            # Store results
            self.results['files_analyzed'].append(filepath)
            self.results['by_year'][str(analysis['fiscal_year'])] = {
                'file': filepath,
                'period': analysis['period'],
                'comparison': comparison
            }
            
            all_comparisons.extend(comparison)
        
        # Generate summary statistics
        self.generate_summary(all_comparisons)
        
        # Save results
        self.save_results()
    
    def generate_summary(self, all_comparisons):
        """Generate summary statistics"""
        if not all_comparisons:
            print("\n=== No data to summarize ===")
            return
            
        df = pd.DataFrame(all_comparisons)
        
        # Find discrepancies (obligation rate > 110% or < 10%)
        discrepancies = df[(df['obligation_rate'] > 110) | (df['obligation_rate'] < 10)]
        
        print("\n=== SUMMARY ===")
        print(f"Total component-year combinations analyzed: {len(df)}")
        
        print("\n=== HIGH OBLIGATION RATES (>110%) ===")
        high_rates = df[df['obligation_rate'] > 110].sort_values('obligation_rate', ascending=False)
        for _, row in high_rates.iterrows():
            print(f"{row['component']} (FY{row['fiscal_year']}): {row['obligation_rate']:.1f}%")
            print(f"  Apportionment: ${row['apportionment']:,.0f}")
            print(f"  Obligations (current FY): ${row['obligations_current_fy']:,.0f}")
            print(f"  Obligations (all years): ${row['obligations_all_years']:,.0f}")
        
        print("\n=== LOW OBLIGATION RATES (<10%) ===")
        low_rates = df[(df['obligation_rate'] < 10) & (df['apportionment'] > 0)].sort_values('obligation_rate')
        for _, row in low_rates.head(10).iterrows():
            print(f"{row['component']} (FY{row['fiscal_year']}): {row['obligation_rate']:.1f}%")
            print(f"  Apportionment: ${row['apportionment']:,.0f}")
            print(f"  Obligations (current FY): ${row['obligations_current_fy']:,.0f}")
        
        # Save discrepancies
        self.results['discrepancies'] = discrepancies.to_dict('records')
        
        # Overall statistics
        self.results['summary'] = {
            'total_records_analyzed': len(df),
            'components_with_high_obligations': len(high_rates),
            'components_with_low_obligations': len(low_rates),
            'average_obligation_rate': df[df['apportionment'] > 0]['obligation_rate'].mean()
        }
    
    def save_results(self):
        """Save analysis results"""
        output_file = 'usaspending_analysis_results.json'
        with open(output_file, 'w') as f:
            json.dump(self.results, f, indent=2, default=str)
        
        print(f"\n=== Results saved to {output_file} ===")
        
        # Also save a CSV for easy viewing
        all_comparisons = []
        for year_data in self.results['by_year'].values():
            all_comparisons.extend(year_data['comparison'])
        
        if all_comparisons:
            df = pd.DataFrame(all_comparisons)
            df.to_csv('usaspending_analysis_summary.csv', index=False)
            print(f"Summary CSV saved to usaspending_analysis_summary.csv")


if __name__ == "__main__":
    analyzer = USAspendingAnalyzer()
    analyzer.run_analysis()