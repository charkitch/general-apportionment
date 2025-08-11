import requests
import re
from bs4 import BeautifulSoup
import json
import pandas as pd
import time
from tqdm import tqdm
import os

# Get all DHS account URLs from the sitemap
print("=== Step 1: Getting all DHS account URLs from sitemap ===")
sitemap_url = "https://openomb.org/sitemaps/accounts.xml"
response = requests.get(sitemap_url)

dhs_account_urls = []
if response.status_code == 200:
    dhs_account_urls = re.findall(r'<loc>(https://openomb\.org/agency/department-of-homeland-security/bureau/[^/]+/account/[^<]+)</loc>', response.text)
    print(f"Found {len(dhs_account_urls)} DHS account URLs from sitemap")

print("\n=== Step 2: Scraping file IDs and fiscal years from account pages ===")

all_files_data = []
account_summaries = []

for account_url in tqdm(dhs_account_urls, desc="Scraping account pages"):
    try:
        response = requests.get(account_url)
        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Extract bureau and account name from URL
            url_parts = account_url.split('/')
            bureau_name = url_parts[-3].replace('-', ' ').title()
            account_name = url_parts[-1].replace('-', ' ').title()
            
            # Find all file links with their metadata
            file_links = soup.find_all('a', href=re.compile(r'/file/\d+'))
            
            account_files = []
            for link in file_links:
                href = link.get('href')
                file_id_match = re.search(r'/file/(\d+)', href)
                if file_id_match:
                    file_id = file_id_match.group(1)
                    
                    # Extract TAFS and FY from the href
                    # Pattern: /file/11198962#tafs_11198962--070-0411-2020-2022--1--2022
                    tafs_match = re.search(r'#tafs_\d+--(.+?)--(\d+)--(\d{4})$', href)
                    if tafs_match:
                        tafs = tafs_match.group(1).replace('-', '/')
                        iteration = tafs_match.group(2)
                        fiscal_year = tafs_match.group(3)
                    else:
                        # Fallback - just get the file ID
                        tafs = None
                        iteration = None
                        fiscal_year = None
                    
                    file_data = {
                        'file_id': file_id,
                        'bureau': bureau_name,
                        'account': account_name,
                        'tafs': tafs,
                        'fiscal_year': fiscal_year,
                        'iteration': iteration,
                        'account_url': account_url
                    }
                    all_files_data.append(file_data)
                    account_files.append(file_data)
            
            # Get expected count
            count_match = re.search(r'(\d+) files? in this account', response.text)
            expected_count = int(count_match.group(1)) if count_match else None
            
            account_summaries.append({
                'bureau': bureau_name,
                'account': account_name,
                'url': account_url,
                'files_found': len(account_files),
                'expected_files': expected_count
            })
            
        time.sleep(0.2)  # Be nice to the server
        
    except Exception as e:
        print(f"Error scraping {account_url}: {e}")

# Convert to DataFrames
files_df = pd.DataFrame(all_files_data)
files_df = files_df.drop_duplicates(subset=['file_id'])

accounts_df = pd.DataFrame(account_summaries)

print(f"\n=== Summary ===")
print(f"Total unique files found: {len(files_df)}")
print(f"Total accounts scraped: {len(accounts_df)}")

# Show fiscal year distribution
if 'fiscal_year' in files_df.columns:
    fy_counts = files_df['fiscal_year'].value_counts().sort_index()
    print("\n=== Files by Fiscal Year ===")
    print(fy_counts)

# Show bureau summary
bureau_summary = files_df.groupby('bureau').size().sort_values(ascending=False)
print("\n=== Files by Bureau ===")
for bureau, count in bureau_summary.head(10).items():
    print(f"{bureau}: {count} files")

# Create data directory if it doesn't exist
os.makedirs('data', exist_ok=True)

# Save the enhanced data
files_df.to_csv("data/dhs_files_with_fy.csv", index=False)
print(f"\nSaved {len(files_df)} files to data/dhs_files_with_fy.csv")

accounts_df.to_csv("data/dhs_accounts_summary.csv", index=False)
print(f"Saved account summary to data/dhs_accounts_summary.csv")

# Save just the file IDs for easy access
file_ids = sorted(files_df['file_id'].unique())
with open("data/dhs_complete_file_ids.json", "w") as f:
    json.dump({
        'file_ids': file_ids,
        'total_files': len(file_ids),
        'bureau_counts': bureau_summary.to_dict()
    }, f, indent=2)

print(f"Saved {len(file_ids)} file IDs to data/dhs_complete_file_ids.json")