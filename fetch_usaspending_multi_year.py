#!/usr/bin/env python3
"""
Fetch USAspending account data via API for multiple years/periods.
Can handle multiple fiscal years and quarters/periods.
"""

import os
import requests
import time
import zipfile
import json
import argparse
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class USAspendingMultiYearClient:
    def __init__(self):
        self.api_key = os.getenv('USASPENDING_API_KEY')
        self.base_url = 'https://api.usaspending.gov/api/v2'
        self.headers = {
            'Content-Type': 'application/json'
        }
        if self.api_key:
            self.headers['Authorization'] = f'Bearer {self.api_key}'
        self.active_downloads = []
    
    def request_account_download(self, fiscal_year, quarter, agency='070', account_level='treasury_account'):
        """
        Request account data download for a specific year and quarter.
        
        Args:
            fiscal_year: int, e.g. 2025
            quarter: int, 1-4 (Q1=periods 1-3, Q2=4-6, Q3=7-9, Q4=10-12)
            agency: str, agency code (default '070' for DHS)
            account_level: str, 'treasury_account' or 'federal_account'
        """
        print(f"\nRequesting {agency} account data for FY{fiscal_year} Q{quarter}...")
        
        payload = {
            "account_level": account_level,
            "filters": {
                "fy": str(fiscal_year),
                "quarter": quarter,
                "submission_types": [
                    "account_balances",           # File A
                    "object_class_program_activity",  # File B
                    "award_financial"             # File C
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
            print(f"✓ Download request submitted for FY{fiscal_year} Q{quarter}")
            print(f"  File: {result.get('file_name', 'N/A')}")
            print(f"  Status URL: {result.get('status_url', 'N/A')}")
            
            # Store download info
            download_info = {
                'fiscal_year': fiscal_year,
                'quarter': quarter,
                'file_name': result.get('file_name'),
                'status_url': result.get('status_url'),
                'file_url': result.get('file_url'),
                'requested_at': datetime.now().isoformat()
            }
            self.active_downloads.append(download_info)
            return download_info
        else:
            print(f"✗ Download request failed for FY{fiscal_year} Q{quarter}: {response.status_code}")
            print(f"Response: {response.text}")
            return None
    
    def check_download_status(self, status_url):
        """Check the status of a download request"""
        response = requests.get(status_url, headers=self.headers)
        
        if response.status_code == 200:
            return response.json()
        else:
            return None
    
    def monitor_downloads(self):
        """Monitor all active downloads"""
        if not self.active_downloads:
            print("No active downloads to monitor")
            return
        
        print(f"\nMonitoring {len(self.active_downloads)} downloads...")
        completed = []
        failed = []
        
        check_count = 0
        wait_intervals = [30, 60, 120, 300, 300]  # Progressive wait times
        
        while self.active_downloads:
            check_count += 1
            print(f"\n--- Check #{check_count} ---")
            
            for download in self.active_downloads[:]:  # Copy list to iterate safely
                status = self.check_download_status(download['status_url'])
                
                if not status:
                    print(f"✗ Failed to check status for FY{download['fiscal_year']} Q{download['quarter']}")
                    continue
                
                current_status = status.get('status', '').lower()
                elapsed = status.get('seconds_elapsed', 'unknown')
                
                print(f"FY{download['fiscal_year']} Q{download['quarter']}: {current_status} (elapsed: {elapsed}s)")
                
                if current_status in ['finished', 'ready']:
                    print(f"  ✓ Ready to download!")
                    download['file_url'] = status.get('file_url')
                    completed.append(download)
                    self.active_downloads.remove(download)
                elif current_status in ['failed', 'error']:
                    print(f"  ✗ Failed: {status.get('message', 'Unknown error')}")
                    failed.append(download)
                    self.active_downloads.remove(download)
            
            if self.active_downloads:
                # Determine wait time
                if check_count <= len(wait_intervals):
                    wait_time = wait_intervals[check_count - 1]
                else:
                    wait_time = 300  # Default to 5 minutes
                
                print(f"\nWaiting {wait_time} seconds before next check...")
                time.sleep(wait_time)
        
        return completed, failed
    
    def download_files(self, completed_downloads, output_dir='usaspending_data'):
        """Download all completed files"""
        output_path = Path(output_dir)
        output_path.mkdir(exist_ok=True)
        
        downloaded_files = []
        
        for download in completed_downloads:
            file_url = download.get('file_url')
            if not file_url:
                print(f"✗ No file URL for FY{download['fiscal_year']} Q{download['quarter']}")
                continue
            
            filename = f"DHS_FY{download['fiscal_year']}_Q{download['quarter']}_AccountData.zip"
            filepath = output_path / filename
            
            print(f"\nDownloading {filename}...")
            
            response = requests.get(file_url, stream=True)
            
            if response.status_code == 200:
                with open(filepath, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        f.write(chunk)
                print(f"✓ Downloaded: {filepath}")
                
                # Extract the zip
                extract_dir = output_path / f"FY{download['fiscal_year']}_Q{download['quarter']}"
                with zipfile.ZipFile(filepath, 'r') as zip_ref:
                    zip_ref.extractall(extract_dir)
                print(f"✓ Extracted to: {extract_dir}")
                
                downloaded_files.append({
                    'fiscal_year': download['fiscal_year'],
                    'quarter': download['quarter'],
                    'zip_path': str(filepath),
                    'extract_dir': str(extract_dir)
                })
            else:
                print(f"✗ Download failed: {response.status_code}")
        
        return downloaded_files
    
    def fetch_multiple_periods(self, year_quarters):
        """
        Fetch data for multiple year/quarter combinations.
        
        Args:
            year_quarters: list of tuples [(year, quarter), ...]
                          e.g. [(2023, 4), (2024, 1), (2024, 2)]
        """
        print(f"=== USAspending Multi-Period Fetch ===")
        print(f"Requesting data for {len(year_quarters)} periods")
        
        # Submit all requests
        for year, quarter in year_quarters:
            self.request_account_download(year, quarter)
            time.sleep(2)  # Small delay between requests
        
        # Monitor downloads
        completed, failed = self.monitor_downloads()
        
        print(f"\n=== Download Summary ===")
        print(f"Completed: {len(completed)}")
        print(f"Failed: {len(failed)}")
        
        # Download completed files
        if completed:
            downloaded = self.download_files(completed)
            
            # Save summary
            summary_file = Path('usaspending_data') / 'download_summary.json'
            with open(summary_file, 'w') as f:
                json.dump({
                    'completed': completed,
                    'failed': failed,
                    'downloaded': downloaded,
                    'timestamp': datetime.now().isoformat()
                }, f, indent=2)
            print(f"\nSummary saved to: {summary_file}")
        
        return completed, failed


def parse_year_quarters(args_list):
    """Parse year/quarter arguments into tuples"""
    year_quarters = []
    
    for arg in args_list:
        if ':' in arg:
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
            # Single year format: 2024 (all quarters)
            year = int(arg)
            for q in range(1, 5):
                year_quarters.append((year, q))
    
    return year_quarters


def main():
    parser = argparse.ArgumentParser(
        description='Fetch USAspending account data for multiple years/quarters',
        epilog='''
Examples:
  # Fetch all quarters for 2024:
  python fetch_usaspending_multi_year.py 2024
  
  # Fetch specific quarters:
  python fetch_usaspending_multi_year.py 2023:4 2024:1 2024:2
  
  # Fetch a range:
  python fetch_usaspending_multi_year.py 2023:4-2024:2
  
  # Mix formats:
  python fetch_usaspending_multi_year.py 2023:4-2024:2 2025
'''
    )
    
    parser.add_argument(
        'periods',
        nargs='+',
        help='Year or year:quarter to fetch (e.g., 2024 or 2024:1 or 2023:4-2024:2)'
    )
    
    parser.add_argument(
        '--agency',
        default='070',
        help='Agency code (default: 070 for DHS)'
    )
    
    parser.add_argument(
        '--account-level',
        choices=['treasury_account', 'federal_account'],
        default='treasury_account',
        help='Account level (default: treasury_account)'
    )
    
    args = parser.parse_args()
    
    # Parse year/quarter combinations
    year_quarters = parse_year_quarters(args.periods)
    
    print(f"Will fetch data for: {year_quarters}")
    
    # Initialize client and fetch
    client = USAspendingMultiYearClient()
    client.fetch_multiple_periods(year_quarters)


if __name__ == "__main__":
    main()