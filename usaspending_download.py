#!/usr/bin/env python3
"""
Monitor and download USAspending files from saved requests.
Reads request URLs from JSON file created by usaspending_request.py.
"""

import os
import requests
import json
import time
import zipfile
import argparse
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class USAspendingDownloader:
    def __init__(self, requests_file='usaspending_requests.json', output_dir='usaspending_data'):
        self.api_key = os.getenv('USASPENDING_API_KEY')
        self.headers = {}
        if self.api_key:
            self.headers['Authorization'] = f'Bearer {self.api_key}'
        
        self.requests_file = Path(requests_file)
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)
        
        self.requests = self.load_requests()
    
    def load_requests(self):
        """Load requests from JSON file"""
        if not self.requests_file.exists():
            print(f"✗ Request file not found: {self.requests_file}")
            print(f"  Run 'python usaspending_request.py' first to create requests")
            return None
        
        with open(self.requests_file, 'r') as f:
            data = json.load(f)
        
        print(f"Loaded {len(data.get('requests', []))} requests from {self.requests_file}")
        return data
    
    def save_requests(self):
        """Save updated requests back to JSON file"""
        self.requests['last_checked'] = datetime.now().isoformat()
        with open(self.requests_file, 'w') as f:
            json.dump(self.requests, f, indent=2)
    
    def check_status(self, request):
        """Check the status of a single request"""
        status_url = request.get('status_url')
        if not status_url:
            return None
        
        try:
            response = requests.get(status_url, headers=self.headers)
            if response.status_code == 200:
                return response.json()
        except Exception as e:
            print(f"✗ Error checking status: {e}")
        
        return None
    
    def download_file(self, file_url, output_path):
        """Download a file from URL"""
        try:
            response = requests.get(file_url, stream=True, headers=self.headers)
            
            if response.status_code == 200:
                with open(output_path, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        f.write(chunk)
                return True
            else:
                print(f"✗ Download failed with status {response.status_code}")
                return False
        except Exception as e:
            print(f"✗ Download error: {e}")
            return False
    
    def monitor_and_download(self, filter_status=None):
        """Monitor all requests and download when ready"""
        if not self.requests:
            return
        
        # Filter requests if specified
        requests_to_check = []
        for req in self.requests['requests']:
            current_status = req.get('status', '').lower()
            
            if filter_status:
                if filter_status == 'pending' and current_status in ['requested', 'running']:
                    requests_to_check.append(req)
                elif filter_status == 'all':
                    requests_to_check.append(req)
            else:
                # By default, only check non-completed requests
                if current_status not in ['completed', 'failed', 'error']:
                    requests_to_check.append(req)
        
        if not requests_to_check:
            print("No pending requests to check")
            return
        
        print(f"\n=== Monitoring {len(requests_to_check)} requests ===")
        
        check_count = 0
        wait_intervals = [30, 60, 120, 300, 300]  # Progressive wait times
        
        while requests_to_check:
            check_count += 1
            print(f"\n--- Check #{check_count} at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ---")
            
            for req in requests_to_check[:]:  # Copy to iterate safely
                req_id = req['id']
                print(f"\n{req_id}:")
                
                status = self.check_status(req)
                
                if not status:
                    print(f"  ✗ Failed to check status")
                    continue
                
                current_status = status.get('status', '').lower()
                elapsed = status.get('seconds_elapsed', 'unknown')
                
                print(f"  Status: {current_status} (elapsed: {elapsed}s)")
                
                # Update request info
                req['status'] = current_status
                req['last_checked'] = datetime.now().isoformat()
                req['seconds_elapsed'] = elapsed
                
                if current_status in ['finished', 'ready']:
                    print(f"  ✓ Ready to download!")
                    
                    # Download the file
                    file_url = status.get('file_url', req.get('file_url'))
                    if file_url:
                        filename = f"{req_id}_AccountData.zip"
                        filepath = self.output_dir / filename
                        
                        print(f"  Downloading to: {filepath}")
                        
                        if self.download_file(file_url, filepath):
                            print(f"  ✓ Downloaded successfully")
                            
                            # Extract the zip
                            extract_dir = self.output_dir / req_id
                            try:
                                with zipfile.ZipFile(filepath, 'r') as zip_ref:
                                    zip_ref.extractall(extract_dir)
                                print(f"  ✓ Extracted to: {extract_dir}")
                                
                                req['status'] = 'completed'
                                req['download_path'] = str(filepath)
                                req['extract_dir'] = str(extract_dir)
                                req['completed_at'] = datetime.now().isoformat()
                            except Exception as e:
                                print(f"  ✗ Extraction failed: {e}")
                        else:
                            req['status'] = 'download_failed'
                    
                    requests_to_check.remove(req)
                    self.save_requests()  # Save after each download
                    
                elif current_status in ['failed', 'error']:
                    print(f"  ✗ Request failed: {status.get('message', 'Unknown error')}")
                    req['status'] = 'failed'
                    req['error_message'] = status.get('message', 'Unknown error')
                    requests_to_check.remove(req)
                    self.save_requests()
            
            if requests_to_check:
                # Determine wait time
                if check_count <= len(wait_intervals):
                    wait_time = wait_intervals[check_count - 1]
                else:
                    wait_time = 300  # Default to 5 minutes
                
                print(f"\n{len(requests_to_check)} requests still pending")
                print(f"Waiting {wait_time} seconds before next check...")
                
                # Save current state
                self.save_requests()
                
                time.sleep(wait_time)
        
        print("\n=== Download session complete ===")
        self.print_summary()
    
    def print_summary(self):
        """Print summary of all requests"""
        if not self.requests:
            return
        
        status_counts = {}
        for req in self.requests['requests']:
            status = req.get('status', 'unknown')
            status_counts[status] = status_counts.get(status, 0) + 1
        
        print("\n=== Request Summary ===")
        for status, count in sorted(status_counts.items()):
            print(f"{status}: {count}")
        
        # Show completed downloads
        completed = [r for r in self.requests['requests'] if r.get('status') == 'completed']
        if completed:
            print(f"\nCompleted downloads:")
            for req in completed:
                print(f"  - {req['id']}: {req.get('download_path', 'N/A')}")
    
    def check_once(self):
        """Check status once without waiting"""
        if not self.requests:
            return
        
        print("\n=== Status Check ===")
        
        for req in self.requests['requests']:
            req_id = req['id']
            current_stored_status = req.get('status', 'unknown')
            
            print(f"\n{req_id}:")
            print(f"  Stored status: {current_stored_status}")
            
            if current_stored_status in ['completed']:
                print(f"  ✓ Already completed")
                continue
            
            status = self.check_status(req)
            
            if status:
                current_status = status.get('status', '').lower()
                elapsed = status.get('seconds_elapsed', 'unknown')
                
                print(f"  Current status: {current_status} (elapsed: {elapsed}s)")
                
                # Update stored status
                req['status'] = current_status
                req['last_checked'] = datetime.now().isoformat()
                req['seconds_elapsed'] = elapsed
            else:
                print(f"  ✗ Failed to check status")
        
        self.save_requests()
        self.print_summary()


def main():
    parser = argparse.ArgumentParser(
        description='Monitor and download USAspending files',
        epilog='''
Examples:
  # Monitor and download all pending requests:
  python usaspending_download.py
  
  # Just check status once without waiting:
  python usaspending_download.py --check
  
  # Re-check all requests (including completed):
  python usaspending_download.py --all
  
  # Use a different requests file:
  python usaspending_download.py --input my_requests.json
'''
    )
    
    parser.add_argument(
        '--input',
        default='usaspending_requests.json',
        help='Input JSON file with requests (default: usaspending_requests.json)'
    )
    
    parser.add_argument(
        '--output-dir',
        default='usaspending_data',
        help='Output directory for downloads (default: usaspending_data)'
    )
    
    parser.add_argument(
        '--check',
        action='store_true',
        help='Just check status once without waiting'
    )
    
    parser.add_argument(
        '--all',
        action='store_true',
        help='Check all requests, including completed ones'
    )
    
    args = parser.parse_args()
    
    # Initialize downloader
    downloader = USAspendingDownloader(args.input, args.output_dir)
    
    if args.check:
        # Just check once
        downloader.check_once()
    else:
        # Monitor and download
        filter_status = 'all' if args.all else 'pending'
        downloader.monitor_and_download(filter_status)


if __name__ == "__main__":
    main()