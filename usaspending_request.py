#!/usr/bin/env python3
"""
Submit USAspending download requests and save URLs to JSON file.
This script only makes requests - use usaspending_download.py to monitor and download.
"""

import os
import requests
import json
import argparse
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class USAspendingRequester:
    def __init__(self, output_file='usaspending_requests.json'):
        self.api_key = os.getenv('USASPENDING_API_KEY')
        self.base_url = 'https://api.usaspending.gov/api/v2'
        self.headers = {
            'Content-Type': 'application/json'
        }
        if self.api_key:
            self.headers['Authorization'] = f'Bearer {self.api_key}'
        
        self.output_file = Path(output_file)
        self.requests = self.load_existing_requests()
    
    def load_existing_requests(self):
        """Load existing requests from JSON file if it exists"""
        if self.output_file.exists():
            try:
                with open(self.output_file, 'r') as f:
                    data = json.load(f)
                    print(f"Loaded {len(data.get('requests', []))} existing requests from {self.output_file}")
                    return data
            except:
                print(f"Could not load {self.output_file}, starting fresh")
                return {'requests': []}
        return {'requests': []}
    
    def save_requests(self):
        """Save all requests to JSON file"""
        self.requests['last_updated'] = datetime.now().isoformat()
        with open(self.output_file, 'w') as f:
            json.dump(self.requests, f, indent=2)
        print(f"\nSaved {len(self.requests['requests'])} requests to {self.output_file}")
    
    def request_account_download(self, fiscal_year, quarter, agency='070', account_level='treasury_account'):
        """Submit a download request and save the URLs"""
        
        # Check if we already have this request
        request_id = f"FY{fiscal_year}_Q{quarter}_{agency}"
        existing = next((r for r in self.requests['requests'] if r['id'] == request_id), None)
        
        if existing and existing.get('status') not in ['failed', 'error']:
            print(f"\n✓ Already have request for {request_id}")
            print(f"  Status URL: {existing['status_url']}")
            return existing
        
        print(f"\nRequesting {agency} account data for FY{fiscal_year} Q{quarter}...")
        
        payload = {
            "account_level": account_level,
            "filters": {
                "fy": str(fiscal_year),
                "quarter": quarter,
                "submission_types": [
                    "account_balances",
                    "object_class_program_activity",
                    "award_financial"
                ],
                "agency": agency
            }
        }
        
        response = requests.post(
            f'{self.base_url}/download/accounts/',
            headers=self.headers,
            json=payload
        )
        
        if response.status_code == 200:
            result = response.json()
            
            request_info = {
                'id': request_id,
                'fiscal_year': fiscal_year,
                'quarter': quarter,
                'agency': agency,
                'account_level': account_level,
                'file_name': result.get('file_name'),
                'status_url': result.get('status_url'),
                'file_url': result.get('file_url'),
                'requested_at': datetime.now().isoformat(),
                'status': 'requested',
                'download_request': result.get('download_request', {})
            }
            
            # Remove old version if it exists
            self.requests['requests'] = [r for r in self.requests['requests'] if r['id'] != request_id]
            
            # Add new request
            self.requests['requests'].append(request_info)
            
            print(f"✓ Request submitted successfully")
            print(f"  File: {request_info['file_name']}")
            print(f"  Status URL: {request_info['status_url']}")
            
            # Save immediately after each request
            self.save_requests()
            
            return request_info
        else:
            print(f"✗ Request failed: {response.status_code}")
            print(f"Response: {response.text}")
            return None
    
    def submit_multiple_requests(self, year_quarters, agency='070'):
        """Submit multiple download requests"""
        print(f"=== USAspending Request Submission ===")
        print(f"Submitting {len(year_quarters)} requests for agency {agency}")
        
        successful = 0
        failed = 0
        
        for year, quarter in year_quarters:
            result = self.request_account_download(year, quarter, agency)
            if result:
                successful += 1
            else:
                failed += 1
            
            # Small delay between requests
            import time
            time.sleep(2)
        
        print(f"\n=== Summary ===")
        print(f"Successful requests: {successful}")
        print(f"Failed requests: {failed}")
        print(f"\nTo monitor and download these files, run:")
        print(f"  python usaspending_download.py")


def parse_year_quarters(args_list):
    """Parse year/quarter arguments into tuples"""
    year_quarters = []
    
    for arg in args_list:
        if ':' in arg:
            if '-' in arg:
                # Range format: 2023:4-2024:2
                start, end = arg.split('-')
                start_year, start_q = map(int, start.split(':'))
                end_year, end_q = map(int, end.split(':'))
                
                # Generate all quarters in range
                current_year = start_year
                current_q = start_q
                
                while (current_year < end_year) or (current_year == end_year and current_q <= end_q):
                    year_quarters.append((current_year, current_q))
                    current_q += 1
                    if current_q > 4:
                        current_q = 1
                        current_year += 1
            else:
                # Single quarter: 2024:1
                year, quarter = map(int, arg.split(':'))
                year_quarters.append((year, quarter))
        else:
            # Single year format: 2024 (all quarters)
            year = int(arg)
            for q in range(1, 5):
                year_quarters.append((year, q))
    
    return year_quarters


def main():
    parser = argparse.ArgumentParser(
        description='Submit USAspending download requests',
        epilog='''
Examples:
  # Request all quarters for 2024:
  python usaspending_request.py 2024
  
  # Request specific quarters:
  python usaspending_request.py 2023:4 2024:1 2024:2
  
  # Request a range:
  python usaspending_request.py 2023:4-2024:2
  
  # Mix formats:
  python usaspending_request.py 2023 2024:1-2024:3
'''
    )
    
    parser.add_argument(
        'periods',
        nargs='+',
        help='Year or year:quarter to request'
    )
    
    parser.add_argument(
        '--agency',
        default='070',
        help='Agency code (default: 070 for DHS)'
    )
    
    parser.add_argument(
        '--output',
        default='usaspending_requests.json',
        help='Output JSON file (default: usaspending_requests.json)'
    )
    
    args = parser.parse_args()
    
    # Parse year/quarter combinations
    year_quarters = parse_year_quarters(args.periods)
    
    print(f"Will submit requests for: {year_quarters}")
    
    # Initialize requester and submit
    requester = USAspendingRequester(args.output)
    requester.submit_multiple_requests(year_quarters, args.agency)


if __name__ == "__main__":
    main()