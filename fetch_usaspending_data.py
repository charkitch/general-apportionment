#!/usr/bin/env python3
"""
Fetch USAspending account data via API to match the manually downloaded files.
This will pull the same File A (Account Balances) data that was manually downloaded.
"""

import os
import requests
import time
import zipfile
import json
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class USAspendingAPIClient:
    def __init__(self):
        self.api_key = os.getenv('USASPENDING_API_KEY')
        self.base_url = 'https://api.usaspending.gov/api/v2'
        self.headers = {
            'Content-Type': 'application/json'
        }
        if self.api_key:
            self.headers['Authorization'] = f'Bearer {self.api_key}'
    
    def test_connection(self):
        """Test API connectivity with a simple endpoint"""
        try:
            # Test with references endpoint that doesn't require specific parameters
            response = requests.get(
                f'{self.base_url}/references/def_codes/',
                headers=self.headers
            )
            if response.status_code == 200:
                print("✓ API connection successful")
                return True
            else:
                print(f"✗ API connection failed: {response.status_code}")
                print(f"Response: {response.text}")
                return False
        except Exception as e:
            print(f"✗ API connection error: {e}")
            return False
    
    def request_account_download(self, fiscal_year, fiscal_period, account_level='treasury_account'):
        """
        Request account data download matching the manual download parameters:
        - Agency: Department of Homeland Security (070)
        - Federal Account: All
        - Account Level: Treasury Account
        - File Type: All three files (A, B, C)
        - Fiscal Year: 2025
        - Period: 9
        """
        print(f"\nRequesting DHS account data for FY{fiscal_year} P{fiscal_period}...")
        
        # Determine quarter from period (1-3 = Q1, 4-6 = Q2, 7-9 = Q3, 10-12 = Q4)
        quarter = ((fiscal_period - 1) // 3) + 1
        
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
                "agency": "070"  # DHS toptier agency code
            }
        }
        
        response = requests.post(
            f'{self.base_url}/download/accounts/',
            headers=self.headers,
            json=payload
        )
        
        if response.status_code == 200:
            result = response.json()
            print(f"✓ Download request submitted successfully")
            print(f"  File URL: {result.get('file_url', 'N/A')}")
            print(f"  Status URL: {result.get('status_url', 'N/A')}")
            return result
        else:
            print(f"✗ Download request failed: {response.status_code}")
            print(f"Response: {response.text}")
            return None
    
    def check_download_status(self, status_url):
        """Check the status of a download request"""
        # Use the full URL directly
        response = requests.get(
            status_url,
            headers=self.headers
        )
        
        if response.status_code == 200:
            return response.json()
        else:
            print(f"✗ Status check failed: {response.status_code}")
            return None
    
    def wait_for_download(self, status_url):
        """Wait for download to complete with longer intervals"""
        check_count = 0
        
        # Initial quick checks, then progressively longer waits
        wait_intervals = [30, 60, 120, 300, 300]  # 30s, 1m, 2m, 5m, 5m...
        
        while True:
            status = self.check_download_status(status_url)
            
            if not status:
                print("✗ Failed to check status")
                return None
                
            current_status = status.get('status', '').lower()
            elapsed = status.get('seconds_elapsed', 'unknown')
            
            if current_status in ['finished', 'ready']:
                print("✓ Download ready!")
                return status.get('file_url')
            elif current_status in ['failed', 'error']:
                print(f"✗ Download failed: {status.get('message', 'Unknown error')}")
                return None
            else:
                check_count += 1
                print(f"  Check #{check_count}: Status: {current_status} (elapsed: {elapsed}s)")
                
                # Determine wait time
                if check_count <= len(wait_intervals):
                    wait_time = wait_intervals[check_count - 1]
                else:
                    wait_time = 300  # Default to 5 minutes for subsequent checks
                
                print(f"  Waiting {wait_time} seconds before next check...")
                time.sleep(wait_time)
                
                # After 30 minutes total, ask user
                if check_count > 6:
                    user_input = input(f"\nDownload still processing after ~30 minutes. Continue waiting? (y/n): ")
                    if user_input.lower() != 'y':
                        print("Download cancelled by user")
                        return None
        
        return None
    
    def download_file(self, file_url, output_dir='usaspending_api_data'):
        """Download the generated file"""
        if not file_url:
            return None
            
        # Create output directory
        output_path = Path(output_dir)
        output_path.mkdir(exist_ok=True)
        
        # Generate filename with timestamp
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f'DHS_AccountData_{timestamp}.zip'
        filepath = output_path / filename
        
        print(f"\nDownloading file to {filepath}...")
        
        response = requests.get(file_url, stream=True)
        
        if response.status_code == 200:
            with open(filepath, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            print(f"✓ Downloaded successfully: {filepath}")
            return filepath
        else:
            print(f"✗ Download failed: {response.status_code}")
            return None
    
    def extract_zip(self, zip_path):
        """Extract the downloaded zip file"""
        if not zip_path or not Path(zip_path).exists():
            return None
            
        extract_dir = Path(zip_path).parent / Path(zip_path).stem
        
        print(f"\nExtracting to {extract_dir}...")
        
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_dir)
            
        # List extracted files
        extracted_files = list(extract_dir.glob('*.csv'))
        print(f"✓ Extracted {len(extracted_files)} files:")
        for f in extracted_files:
            print(f"  - {f.name}")
            
        return extract_dir
    
    def fetch_dhs_account_data(self, fiscal_year=2025, fiscal_period=9):
        """Main method to fetch DHS account data"""
        print("=== USAspending API Data Fetch ===")
        print(f"Target: DHS FY{fiscal_year} P{fiscal_period} Account Balances")
        
        # Test connection
        if not self.test_connection():
            print("\n✗ API connection test failed. Check your API key if required.")
            return None
        
        # Request download
        request_result = self.request_account_download(fiscal_year, fiscal_period)
        if not request_result:
            return None
            
        # Wait for download to complete
        status_url = request_result.get('status_url')
        if not status_url:
            print("✗ No status URL received")
            return None
            
        file_url = self.wait_for_download(status_url)
        if not file_url:
            return None
            
        # Download the file
        zip_path = self.download_file(file_url)
        if not zip_path:
            return None
            
        # Extract files
        extract_dir = self.extract_zip(zip_path)
        
        return extract_dir


def main():
    """Main function to fetch data and run validation"""
    # Initialize API client
    client = USAspendingAPIClient()
    
    # Fetch data
    data_dir = client.fetch_dhs_account_data(fiscal_year=2025, fiscal_period=9)
    
    if data_dir:
        print(f"\n✓ Data successfully fetched to: {data_dir}")
        
        # Now we can run the validation using the existing script
        print("\n=== Running TAS Validation ===")
        from validate_usaspending_tas import USAspendingTASValidator
        
        # Use the newly downloaded data
        validator = USAspendingTASValidator(
            data_dir, 
            "data/dhs_tas_aggregated_with_fund_types.csv"
        )
        validator.run()
    else:
        print("\n✗ Failed to fetch data")


if __name__ == "__main__":
    main()