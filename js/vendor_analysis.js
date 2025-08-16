/**
 * DHS Vendor Analysis - Explore contractors and grantees over time
 */

// Global variables
let awardsData = [];
let filteredData = [];
let vendorComparison = [];
let currentView = 'all';
let currentPage = 1;
let itemsPerPage = 50;  // Will be updated from config
let analysisConfig = null;

// Load data on initialization
async function init() {
    try {
        showLoading();
        
        // Load component mappings and analysis config if available
        if (typeof loadComponentMappings !== 'undefined') {
            await loadComponentMappings();
        }
        
        // Load analysis configuration
        try {
            const response = await fetch('config/data_schema.yaml');
            const yamlText = await response.text();
            const config = jsyaml.load(yamlText);
            
            if (config.analysis_settings) {
                analysisConfig = config.analysis_settings;
                // Update settings from config
                if (analysisConfig.vendor_analysis) {
                    itemsPerPage = analysisConfig.vendor_analysis.items_per_page || 50;
                    // Set default min amount
                    const minAmountInput = document.getElementById('minAmount');
                    if (minAmountInput && analysisConfig.vendor_analysis.default_min_amount) {
                        minAmountInput.value = analysisConfig.vendor_analysis.default_min_amount;
                    }
                }
            }
        } catch (error) {
            console.warn('Could not load analysis config:', error);
        }
        
        // Load awards data
        const response = await fetch('processed_data/usaspending/awards_flat.json');
        awardsData = await response.json();
        
        console.log(`Loaded ${awardsData.length} award records`);
        
        // Debug: Check what fields we have
        if (awardsData.length > 0) {
            console.log('Sample award record:', awardsData[0]);
            console.log('Available fields:', Object.keys(awardsData[0]));
            // Check if contracts have dates
            const recordWithContracts = awardsData.find(d => d.contracts && d.contracts.length > 0);
            if (recordWithContracts && recordWithContracts.contracts[0]) {
                console.log('Sample contract:', recordWithContracts.contracts[0]);
            }
        }
        
        // Analyze data availability
        updateDataAvailability();
        
        // Initialize filters
        populateFilters();
        
        // Set up event handlers
        setupEventHandlers();
        
        // Initial update
        updateAnalysis();
        
    } catch (error) {
        console.error('Failed to load data:', error);
        showError('Failed to load vendor data. Please refresh the page.');
    }
}

/**
 * Update data availability display
 */
function updateDataAvailability() {
    // Get unique fiscal years from the data
    const yearSet = new Set();
    
    awardsData.forEach(record => {
        yearSet.add(record.fiscal_year);
    });
    
    // Build availability text with known information
    const availabilityParts = [];
    
    // We know from the file names what data is available:
    // FY2022: P01-P12 (Complete)
    // FY2023: P01-P12 (Complete) 
    // FY2025: P01-P09 (Through June/Q3)
    // FY2024: Not available
    
    const dataInfo = {
        2022: 'Complete',
        2023: 'Complete',
        2024: null, // Not available
        2025: 'Through Q3 (June)'
    };
    
    // Show years in order
    for (let year = 2022; year <= 2025; year++) {
        if (dataInfo[year] === null) {
            availabilityParts.push(`FY${year} (Not Available)`);
        } else if (yearSet.has(year)) {
            availabilityParts.push(`FY${year} (${dataInfo[year]})`);
        }
    }
    
    document.getElementById('availabilityText').textContent = availabilityParts.join(' • ');
}

/**
 * Populate filter dropdowns
 */
function populateFilters() {
    // Populate Sort By dropdown based on available fiscal years
    const sortBySelect = document.getElementById('sortBy');
    // Clear existing options
    sortBySelect.innerHTML = '';
    
    // Add fiscal year options from config
    if (analysisConfig && analysisConfig.available_fiscal_years) {
        analysisConfig.available_fiscal_years.forEach(year => {
            const option = document.createElement('option');
            option.value = `fy${year}`;
            option.textContent = `${analysisConfig.fiscal_year_labels[year] || `FY ${year}`} Amount`;
            sortBySelect.appendChild(option);
        });
    } else {
        // Fallback if config not loaded
        const defaultOption = document.createElement('option');
        defaultOption.value = 'fy2025';
        defaultOption.textContent = 'FY 2025 Amount';
        sortBySelect.appendChild(defaultOption);
    }
    
    // Add other sort options
    const otherOptions = [
        { value: 'change', text: 'Change ($)' },
        { value: 'change_pct', text: 'Change (%)' },
        { value: 'name', text: 'Vendor Name' }
    ];
    
    otherOptions.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.text;
        sortBySelect.appendChild(option);
    });
    
    // Components
    const components = [...new Set(awardsData.map(d => d.component))].sort();
    const componentSelect = document.getElementById('componentFilter');
    components.forEach(comp => {
        const option = document.createElement('option');
        option.value = comp;
        // Filters should always show full component names
        option.textContent = comp;  // Full name, no abbreviation
        componentSelect.appendChild(option);
    });
    
    // Award types
    const awardTypes = [...new Set(awardsData.map(d => d.award_type))].sort();
    const typeSelect = document.getElementById('awardType');
    awardTypes.forEach(type => {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = type;
        typeSelect.appendChild(option);
    });
    
    // Product/Service Categories
    const pscCategories = new Map();
    awardsData.forEach(d => {
        if (d.product_or_service_code_description) {
            // Group by main category (text before first dash)
            const category = d.product_or_service_code_description.split('-')[0].trim();
            if (!pscCategories.has(category)) {
                pscCategories.set(category, new Set());
            }
            pscCategories.get(category).add(d.product_or_service_code_description);
        }
    });
    
    const pscSelect = document.getElementById('pscFilter');
    // Add main categories
    Array.from(pscCategories.keys()).sort().forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = `${category} (${pscCategories.get(category).size} types)`;
        pscSelect.appendChild(option);
    });
    
    // TAS will be populated based on component selection
    updateTASFilter();
    
}


/**
 * Filter data based on current filters
 */
function filterData() {
    let filtered = [...awardsData];
    
    // Component filter
    const component = document.getElementById('componentFilter').value;
    if (component !== 'all') {
        filtered = filtered.filter(d => d.component === component);
    }
    
    // TAS filter
    const tas = document.getElementById('tasFilter').value;
    if (tas !== 'all') {
        filtered = filtered.filter(d => d.tas === tas);
    }
    
    // Award type filter
    const awardType = document.getElementById('awardType').value;
    if (awardType !== 'all') {
        filtered = filtered.filter(d => d.award_type === awardType);
    }
    
    // PSC filter
    const psc = document.getElementById('pscFilter').value;
    if (psc !== 'all') {
        filtered = filtered.filter(d => 
            d.product_or_service_code_description && 
            d.product_or_service_code_description.startsWith(psc)
        );
    }
    
    // Vendor search
    const search = document.getElementById('vendorSearch').value.toLowerCase();
    if (search) {
        filtered = filtered.filter(d => 
            d.recipient_name.toLowerCase().includes(search)
        );
    }
    
    // Minimum amount
    const minAmount = parseFloat(document.getElementById('minAmount').value) || 0;
    if (minAmount > 0) {
        filtered = filtered.filter(d => (d.obligations || 0) >= minAmount);
    }
    
    return filtered;
}

/**
 * Update TAS filter based on selected component
 */
function updateTASFilter() {
    const component = document.getElementById('componentFilter').value;
    const tasSelect = document.getElementById('tasFilter');
    
    // Filter data by component if selected
    let data = awardsData;
    if (component !== 'all') {
        data = awardsData.filter(d => d.component === component);
    }
    
    // Get unique TAS codes
    const tasCodes = [...new Set(data.map(d => extractTAS(d)))].filter(tas => tas).sort();
    
    // Update dropdown
    tasSelect.innerHTML = '<option value="all">All Accounts</option>';
    tasCodes.forEach(tas => {
        const option = document.createElement('option');
        option.value = tas;
        option.textContent = tas;
        tasSelect.appendChild(option);
    });
}

/**
 * Extract TAS from award data
 */
function extractTAS(record) {
    return record.treasury_account_symbol || null;
}

/**
 * Update the analysis based on filters
 */
function updateAnalysis() {
    // Apply filters
    applyFilters();
    
    // Process vendor comparison
    processVendorComparison();
    
    // Update stats
    updateStats();
    
    // Update visualization based on current view
    updateVisualization();
    
    // Update filter summary
    updateFilterSummary();
}

/**
 * Apply filters to the data
 */
function applyFilters() {
    filteredData = awardsData;
    
    // Component filter
    const component = document.getElementById('componentFilter').value;
    if (component !== 'all') {
        filteredData = filteredData.filter(d => d.component === component);
    }
    
    // TAS filter
    const tas = document.getElementById('tasFilter').value;
    if (tas !== 'all') {
        filteredData = filteredData.filter(d => extractTAS(d) === tas);
    }
    
    // Award type filter
    const awardType = document.getElementById('awardType').value;
    if (awardType !== 'all') {
        filteredData = filteredData.filter(d => d.award_type === awardType);
    }
    
    // PSC filter
    const pscCategory = document.getElementById('pscFilter').value;
    if (pscCategory !== 'all') {
        filteredData = filteredData.filter(d => 
            d.product_or_service_code_description && 
            d.product_or_service_code_description.startsWith(pscCategory)
        );
    }
    
    // Vendor search
    const searchTerm = document.getElementById('vendorSearch').value.toLowerCase();
    if (searchTerm) {
        filteredData = filteredData.filter(d => 
            d.recipient_name.toLowerCase().includes(searchTerm)
        );
    }
    
    // Minimum amount filter
    const minAmount = parseFloat(document.getElementById('minAmount').value) || 0;
    if (minAmount > 0) {
        filteredData = filteredData.filter(d => Math.abs(d.obligations) >= minAmount);
    }
}

/**
 * Process vendor comparison between years
 */
function processVendorComparison() {
    // Debug: Check first few records
    if (filteredData.length > 0) {
        console.log('Sample filtered record:', filteredData[0]);
    }
    
    // Group by vendor and year
    const vendorsByYear = {};
    
    filteredData.forEach(record => {
        const vendor = record.recipient_name;
        const year = record.fiscal_year;
        
        if (!vendorsByYear[vendor]) {
            vendorsByYear[vendor] = {};
        }
        
        if (!vendorsByYear[vendor][year]) {
            vendorsByYear[vendor][year] = {
                obligations: 0,
                count: 0,
                components: new Set(),
                awardTypes: new Set(),
                productServices: new Map(), // Track products/services with amounts
                naics: new Map(), // Track industries with amounts
                state: record.recipient_state,
                details: [] // Store individual records for detailed view
            };
        }
        
        vendorsByYear[vendor][year].obligations += record.obligations || 0;
        vendorsByYear[vendor][year].count += 1;
        vendorsByYear[vendor][year].components.add(record.component);
        vendorsByYear[vendor][year].awardTypes.add(record.award_type);
        
        // Track products/services
        if (record.product_or_service_code_description) {
            const key = record.product_or_service_code_description;
            const current = vendorsByYear[vendor][year].productServices.get(key) || 0;
            vendorsByYear[vendor][year].productServices.set(key, current + (record.obligations || 0));
        } else if (record.product_or_service_code) {
            // Fallback to code if description is missing
            const key = `PSC: ${record.product_or_service_code}`;
            const current = vendorsByYear[vendor][year].productServices.get(key) || 0;
            vendorsByYear[vendor][year].productServices.set(key, current + (record.obligations || 0));
        }
        
        // Track industries
        if (record.naics_description) {
            const key = record.naics_description;
            const current = vendorsByYear[vendor][year].naics.get(key) || 0;
            vendorsByYear[vendor][year].naics.set(key, current + (record.obligations || 0));
        }
        
        // Store detailed records
        vendorsByYear[vendor][year].details.push(record);
        
        // Also store contracts if available
        if (record.contracts && record.contracts.length > 0) {
            if (!vendorsByYear[vendor][year].contracts) {
                vendorsByYear[vendor][year].contracts = [];
            }
            vendorsByYear[vendor][year].contracts.push(...record.contracts);
        }
    });
    
    // Create comparison array
    vendorComparison = [];
    
    Object.entries(vendorsByYear).forEach(([vendor, years]) => {
        const comparison = {
            vendor: vendor,
        };
        
        // Add amounts for all available fiscal years
        const availableYears = analysisConfig?.available_fiscal_years || [2022, 2023, 2025];
        availableYears.forEach(year => {
            const yearData = years[year] || { obligations: 0, count: 0 };
            comparison[`fy${year}_amount`] = yearData.obligations;
            comparison[`fy${year}_count`] = yearData.count;
        });
        
        // Calculate change between comparison years (using config defaults)
        const prevYear = analysisConfig?.comparison_years?.previous || 2023;
        const currYear = analysisConfig?.comparison_years?.current || 2025;
        
        const fyPrev = years[prevYear] || { obligations: 0, count: 0 };
        const fyCurr = years[currYear] || { obligations: 0, count: 0 };
        
        // Keep backward compatibility
        comparison.fy2023_amount = comparison[`fy${prevYear}_amount`] || 0;
        comparison.fy2025_amount = comparison[`fy${currYear}_amount`] || 0;
        comparison.fy2023_count = fyPrev.count;
        comparison.fy2025_count = fyCurr.count;
        comparison.change_amount = fyCurr.obligations - fyPrev.obligations;
        comparison.change_percent = fyPrev.obligations > 0 ? 
            ((fyCurr.obligations - fyPrev.obligations) / fyPrev.obligations) * 100 : 
            (fyCurr.obligations > 0 ? 100 : 0);
        comparison.is_new = fyPrev.obligations === 0 && fyCurr.obligations > 0;
        comparison.is_lost = fyPrev.obligations > 0 && fyCurr.obligations === 0;
        comparison.components = [...new Set([...Array.from(fyPrev.components || []), ...Array.from(fyCurr.components || [])])];
        comparison.awardTypes = [...new Set([...Array.from(fyPrev.awardTypes || []), ...Array.from(fyCurr.awardTypes || [])])];
        comparison.yearData = years; // Store full year data for detailed view
        
        vendorComparison.push(comparison);
    });
    
    // Sort based on current selection
    sortVendors();
}

/**
 * Sort vendors based on selected criteria
 */
function sortVendors() {
    const sortBy = document.getElementById('sortBy').value;
    
    vendorComparison.sort((a, b) => {
        // Check if sorting by a fiscal year
        if (sortBy.startsWith('fy')) {
            const year = sortBy.substring(2);
            const aAmount = a[`fy${year}_amount`] || 0;
            const bAmount = b[`fy${year}_amount`] || 0;
            return bAmount - aAmount;
        }
        
        // Other sort options
        switch (sortBy) {
            case 'change':
                return b.change_amount - a.change_amount;
            case 'change_pct':
                return b.change_percent - a.change_percent;
            case 'name':
                return a.vendor.localeCompare(b.vendor);
            default:
                // Default to current year from config
                const defaultYear = analysisConfig?.comparison_years?.current || 2025;
                return (b[`fy${defaultYear}_amount`] || 0) - (a[`fy${defaultYear}_amount`] || 0);
        }
    });
}

/**
 * Update yearly summary statistics
 */
function updateYearlyStats() {
    const availableYears = analysisConfig?.available_fiscal_years || [2022, 2023, 2025];
    const yearlyData = {};
    
    // Initialize yearly data
    availableYears.forEach(year => {
        yearlyData[year] = {
            vendors: new Set(),
            totalAmount: 0,
            transactions: 0
        };
    });
    
    // Calculate yearly totals from filtered data
    const filteredData = filterData();
    filteredData.forEach(record => {
        const year = record.fiscal_year;
        if (yearlyData[year]) {
            yearlyData[year].vendors.add(record.recipient_name);
            yearlyData[year].totalAmount += record.obligations || 0;
            yearlyData[year].transactions += 1;
        }
    });
    
    // Build HTML for yearly stats
    let html = '';
    availableYears.forEach(year => {
        const data = yearlyData[year];
        const label = analysisConfig?.fiscal_year_labels?.[year] || `FY ${year}`;
        html += `
            <div style="flex: 1; min-width: 200px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                <h4 style="margin: 0 0 10px 0; color: #555;">${label}</h4>
                <div style="font-size: 24px; font-weight: bold; color: #333;">${data.vendors.size.toLocaleString()}</div>
                <div style="font-size: 14px; color: #666;">Unique Vendors</div>
                <div style="font-size: 20px; font-weight: bold; color: #0066cc; margin-top: 10px;">${formatCurrency(data.totalAmount)}</div>
                <div style="font-size: 14px; color: #666;">Total Amount</div>
                <div style="font-size: 14px; color: #999; margin-top: 5px;">${data.transactions.toLocaleString()} transactions</div>
            </div>
        `;
    });
    
    document.getElementById('yearlyStats').innerHTML = html;
}

/**
 * Update statistics (simplified - just calls yearly stats)
 */
function updateStats() {
    updateYearlyStats();
}

/**
 * Update visualization
 */
function updateVisualization() {
    const container = document.getElementById('chart');
    
    // Handle treemap view separately
    if (currentView === 'treemap') {
        drawTreemap();
        return;
    }
    
    // Filter data based on view
    let displayData = vendorComparison;
    
    switch (currentView) {
        case 'all':
            // Show all vendors (default)
            displayData = vendorComparison;
            break;
    }
    
    // Paginate
    const totalPages = Math.ceil(displayData.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageData = displayData.slice(startIndex, endIndex);
    
    // Create table
    let html = '<table class="vendor-table">';
    html += '<thead><tr>';
    html += '<th>Vendor Name</th>';
    
    // Add columns for all available fiscal years
    const availableYears = analysisConfig?.available_fiscal_years || [2022, 2023, 2025];
    availableYears.forEach(year => {
        const label = analysisConfig?.fiscal_year_labels?.[year] || `FY ${year}`;
        html += `<th style="text-align: center;">${label}</th>`;
    });
    
    html += '</tr></thead>';
    html += '<tbody>';
    
    pageData.forEach((vendor, index) => {
        html += `<tr data-index="${startIndex + index}">`;
        html += `<td class="vendor-name" onclick="toggleVendorDetails(${startIndex + index})">${vendor.vendor}</td>`;
        
        // Show amounts for all available fiscal years
        availableYears.forEach((year) => {
            const amount = vendor[`fy${year}_amount`] || 0;
            html += `<td class="amount" style="text-align: center;">${formatCurrency(amount)}</td>`;
        });
        
        html += '</tr>';
        
        // Add hidden details row
        html += `<tr id="details-${startIndex + index}" style="display: none;">`;
        const colspan = availableYears.length + 1; // Vendor name + year columns
        html += `<td colspan="${colspan}"><div class="vendor-details" id="vendor-details-${startIndex + index}"></div></td>`;
        html += '</tr>';
    });
    
    html += '</tbody></table>';
    
    container.innerHTML = html;
    
    // Update pagination
    updatePagination(totalPages);
}

/**
 * Toggle vendor details
 */
function toggleVendorDetails(index) {
    const detailsRow = document.getElementById(`details-${index}`);
    const detailsDiv = document.getElementById(`vendor-details-${index}`);
    
    console.log('Toggle vendor details for index:', index);
    
    if (detailsRow.style.display === 'none') {
        // Show details
        detailsRow.style.display = 'table-row';
        
        // Get vendor data
        const vendor = getDisplayData()[index];
        console.log('Vendor data:', vendor);
        console.log('Year data 2023:', vendor.yearData[2023]);
        console.log('Year data 2025:', vendor.yearData[2025]);
        
        // Debug product services
        if (vendor.yearData[2025] && vendor.yearData[2025].productServices) {
            console.log('Product services for 2025:', Array.from(vendor.yearData[2025].productServices.entries()));
        }
        if (vendor.yearData[2023] && vendor.yearData[2023].productServices) {
            console.log('Product services for 2023:', Array.from(vendor.yearData[2023].productServices.entries()));
        }
        
        // Build details HTML
        let html = '<div class="details-grid">';
        
        // Summary section
        html += '<div class="detail-section">';
        html += '<h4>Summary</h4>';
        html += `<div class="detail-item"><span class="detail-label">Total Awards FY 2023:</span><span class="detail-value">${vendor.fy2023_count}</span></div>`;
        html += `<div class="detail-item"><span class="detail-label">Total Awards FY 2025:</span><span class="detail-value">${vendor.fy2025_count}</span></div>`;
        html += `<div class="detail-item"><span class="detail-label">Average Award FY 2023:</span><span class="detail-value">${vendor.fy2023_count > 0 ? formatCurrency(vendor.fy2023_amount / vendor.fy2023_count) : '-'}</span></div>`;
        html += `<div class="detail-item"><span class="detail-label">Average Award FY 2025:</span><span class="detail-value">${vendor.fy2025_count > 0 ? formatCurrency(vendor.fy2025_amount / vendor.fy2025_count) : '-'}</span></div>`;
        html += '</div>';
        
        // What DHS is buying section
        html += '<div class="detail-section" style="grid-column: span 2;">';
        html += '<h4>What DHS is Buying (Products/Services)</h4>';
        
        // Combine product/service data from both years
        const allProducts = new Map();
        [2023, 2025].forEach(year => {
            const yearData = vendor.yearData[year];
            if (yearData && yearData.productServices) {
                yearData.productServices.forEach((amount, product) => {
                    const current = allProducts.get(product) || { 2023: 0, 2025: 0 };
                    current[year] = amount;
                    allProducts.set(product, current);
                });
            }
        });
        
        // Sort by total amount and show top items
        const sortedProducts = Array.from(allProducts.entries())
            .map(([product, amounts]) => ({
                product: product,
                total: (amounts[2023] || 0) + (amounts[2025] || 0),
                fy2023: amounts[2023] || 0,
                fy2025: amounts[2025] || 0
            }))
            .sort((a, b) => b.total - a.total)
            .slice(0, analysisConfig?.vendor_analysis?.max_products_shown || 10);
        
        if (sortedProducts.length > 0) {
            sortedProducts.forEach(item => {
                html += '<div class="detail-item" style="margin-bottom: 8px;">';
                html += `<span class="detail-label" style="display: block; font-weight: 500;">${item.product}</span>`;
                html += '<div style="display: flex; justify-content: space-between; margin-top: 4px;">';
                html += `<span style="font-size: 12px;">FY23: ${formatCurrency(item.fy2023)}</span>`;
                html += `<span style="font-size: 12px;">FY25: ${formatCurrency(item.fy2025)}</span>`;
                html += `<span style="font-size: 12px; font-weight: 600;">Total: ${formatCurrency(item.total)}</span>`;
                html += '</div>';
                html += '</div>';
            });
        } else {
            html += '<div class="detail-item"><span class="detail-value">No product/service data available</span></div>';
        }
        
        html += '</div>';
        
        // Components section
        html += '<div class="detail-section">';
        html += '<h4>Components</h4>';
        vendor.components.forEach(comp => {
            // Use abbreviated names in tables
            const displayName = typeof getComponentName !== 'undefined' ? getComponentName(comp, 'table') : comp;
            html += `<div class="detail-item"><span class="detail-value">${displayName}</span></div>`;
        });
        html += '</div>';
        
        // Industry section
        html += '<div class="detail-section">';
        html += '<h4>Industries (NAICS)</h4>';
        
        // Combine NAICS data from both years
        const allNaics = new Map();
        [2023, 2025].forEach(year => {
            const yearData = vendor.yearData[year];
            if (yearData && yearData.naics) {
                yearData.naics.forEach((amount, naics) => {
                    const current = allNaics.get(naics) || 0;
                    allNaics.set(naics, current + amount);
                });
            }
        });
        
        const sortedNaics = Array.from(allNaics.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, analysisConfig?.vendor_analysis?.max_industries_shown || 5);
        
        if (sortedNaics.length > 0) {
            sortedNaics.forEach(([naics, amount]) => {
                html += `<div class="detail-item">`;
                html += `<span class="detail-label" style="flex: 1;">${naics}</span>`;
                html += `<span class="detail-value">${formatCurrency(amount)}</span>`;
                html += `</div>`;
            });
        } else {
            html += '<div class="detail-item"><span class="detail-value">No industry data available</span></div>';
        }
        
        html += '</div>';
        
        html += '</div>';
        
        // Add individual contracts section
        html += '<div class="detail-section" style="grid-column: span 2; margin-top: 20px;">';
        html += '<h4>Individual Contracts and Awards</h4>';
        
        // Collect all contracts from both years
        const allContracts = [];
        [2023, 2025].forEach(year => {
            const yearData = vendor.yearData[year];
            if (yearData && yearData.contracts) {
                yearData.contracts.forEach(contract => {
                    allContracts.push({
                        ...contract,
                        year: year
                    });
                });
            }
        });
        
        // Sort by amount descending (handle nulls)
        allContracts.sort((a, b) => {
            const amountA = a.transaction_obligated_amount || 0;
            const amountB = b.transaction_obligated_amount || 0;
            return Math.abs(amountB) - Math.abs(amountA);
        });
        
        if (allContracts.length > 0) {
            html += '<div style="max-height: 400px; overflow-y: auto; border: 1px solid #e0e0e0; border-radius: 4px; padding: 10px;">';
            
            allContracts.slice(0, analysisConfig?.vendor_analysis?.max_contracts_shown || 100).forEach((contract, idx) => { // Show top contracts from config
                html += '<div style="border-bottom: 1px solid #f0f0f0; padding: 10px 0; ' + (idx === allContracts.length - 1 ? 'border-bottom: none;' : '') + '">';
                
                // Contract header with ID and year
                html += '<div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px;">';
                html += '<div>';
                html += '<span style="font-weight: 600; color: #007bff;">' + contract.award_id_piid + '</span>';
                html += ' <span style="color: #666; font-size: 12px;">FY' + contract.year + '</span>';
                html += '</div>';
                const amount = contract.transaction_obligated_amount || 0;
                html += '<span style="font-weight: 600; color: ' + (amount >= 0 ? '#28a745' : '#dc3545') + ';">';
                html += formatCurrency(amount);
                html += '</span>';
                html += '</div>';
                
                // Description
                if (contract.description) {
                    html += '<div style="color: #333; font-size: 13px; margin-bottom: 6px; line-height: 1.4;">';
                    // Escape HTML and truncate very long descriptions
                    const desc = contract.description.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    html += desc.length > 500 ? desc.substring(0, 500) + '...' : desc;
                    html += '</div>';
                }
                
                // Contract details
                html += '<div style="display: flex; gap: 20px; font-size: 12px; color: #666;">';
                
                if (contract.start_date) {
                    try {
                        html += '<div>Start: ' + new Date(contract.start_date).toLocaleDateString() + '</div>';
                    } catch (e) {
                        html += '<div>Start: ' + contract.start_date + '</div>';
                    }
                }
                
                if (contract.end_date) {
                    try {
                        html += '<div>End: ' + new Date(contract.end_date).toLocaleDateString() + '</div>';
                    } catch (e) {
                        html += '<div>End: ' + contract.end_date + '</div>';
                    }
                }
                
                if (contract.action_date) {
                    try {
                        html += '<div>Last Action: ' + new Date(contract.action_date).toLocaleDateString() + '</div>';
                    } catch (e) {
                        html += '<div>Last Action: ' + contract.action_date + '</div>';
                    }
                }
                
                html += '</div>';
                html += '</div>';
            });
            
            const maxContracts = analysisConfig?.vendor_analysis?.max_contracts_shown || 100;
            if (allContracts.length > maxContracts) {
                html += '<div style="padding: 10px; text-align: center; color: #666; font-style: italic;">';
                html += 'Showing top ' + maxContracts + ' of ' + allContracts.length + ' contracts';
                html += '</div>';
            }
            
            html += '</div>';
        } else {
            html += '<div style="color: #666; font-style: italic;">No individual contract details available</div>';
        }
        
        html += '</div>';
        
        detailsDiv.innerHTML = html;
        detailsDiv.style.display = 'block';  // Make sure the div is visible
    } else {
        // Hide details
        detailsRow.style.display = 'none';
    }
}

/**
 * Get current display data based on view
 */
function getDisplayData() {
    switch (currentView) {
        case 'all':
            return vendorComparison;
        case 'treemap':
            return vendorComparison;
        default:
            return vendorComparison;
    }
}

/**
 * Update pagination controls
 */
function updatePagination(totalPages) {
    const pagination = document.getElementById('pagination');
    const pageInfo = document.getElementById('pageInfo');
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    
    if (totalPages <= 1) {
        pagination.style.display = 'none';
        return;
    }
    
    pagination.style.display = 'flex';
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages;
}

/**
 * Update filter summary
 */
function updateFilterSummary() {
    const component = document.getElementById('componentFilter').value;
    const tas = document.getElementById('tasFilter').value;
    const awardType = document.getElementById('awardType').value;
    const pscCategory = document.getElementById('pscFilter').value;
    const minAmount = document.getElementById('minAmount').value;
    
    let summary = 'Showing ';
    
    switch (currentView) {
        case 'all':
            summary += 'all vendors ';
            break;
        case 'treemap':
            summary += 'market share by vendor ';
            break;
        default:
            summary += 'vendors ';
    }
    
    if (component !== 'all') {
        summary += `for ${component} `;
    } else {
        summary += 'across all components ';
    }
    
    if (tas !== 'all') {
        summary += `in account ${tas} `;
    }
    
    if (awardType !== 'all') {
        summary += `(${awardType} only) `;
    }
    
    if (pscCategory !== 'all') {
        summary += `for ${pscCategory} products/services `;
    }
    
    if (minAmount && parseFloat(minAmount) > 0) {
        summary += `with awards ≥ ${formatCurrency(parseFloat(minAmount))}`;
    }
    
    document.getElementById('filterSummary').textContent = summary;
}

/**
 * Draw treemap visualization
 */
function drawTreemap() {
    const container = document.getElementById('chart');
    
    // Get current year data (default to FY2025)
    const vendors = vendorComparison
        .filter(v => v.fy2025_amount > 0)
        .sort((a, b) => b.fy2025_amount - a.fy2025_amount)
        .slice(0, analysisConfig?.vendor_analysis?.top_vendors_count || 50); // Top vendors from config
    
    // Calculate total for "Other" category
    const topTotal = vendors.reduce((sum, v) => sum + v.fy2025_amount, 0);
    const allTotal = vendorComparison
        .filter(v => v.fy2025_amount > 0)
        .reduce((sum, v) => sum + v.fy2025_amount, 0);
    
    if (allTotal > topTotal) {
        vendors.push({
            vendor: 'Other Vendors',
            fy2025_amount: allTotal - topTotal,
            is_other: true
        });
    }
    
    // Create hierarchical data
    const hierarchicalData = {
        name: 'Vendors',
        children: vendors.map(v => ({
            name: v.vendor,
            value: v.fy2025_amount,
            data: v
        }))
    };
    
    // Set up dimensions
    const width = container.offsetWidth;
    const height = 600;
    
    // Clear container
    container.innerHTML = '<div class="treemap-container"></div>';
    const treemapContainer = container.querySelector('.treemap-container');
    
    // Create treemap layout
    const treemap = d3.treemap()
        .size([width, height])
        .padding(2)
        .round(true);
    
    // Create hierarchy
    const root = d3.hierarchy(hierarchicalData)
        .sum(d => d.value)
        .sort((a, b) => b.value - a.value);
    
    treemap(root);
    
    // Color scale - use different colors for product categories
    const colorScale = d3.scaleOrdinal(d3.schemeTableau10);
    
    // Create nodes
    const nodes = d3.select(treemapContainer)
        .selectAll('.treemap-node')
        .data(root.leaves())
        .enter()
        .append('div')
        .attr('class', 'treemap-node')
        .style('left', d => d.x0 + 'px')
        .style('top', d => d.y0 + 'px')
        .style('width', d => Math.max(0, d.x1 - d.x0) + 'px')
        .style('height', d => Math.max(0, d.y1 - d.y0) + 'px')
        .style('background-color', (d, i) => colorScale(i % 10))
        .on('click', function(event, d) {
            if (!d.data.data.is_other) {
                // Find the vendor in the full list and show details
                const index = vendorComparison.findIndex(v => v.vendor === d.data.name);
                if (index >= 0) {
                    // Switch to all view and show this vendor
                    currentView = 'all';
                    document.querySelectorAll('.view-tab').forEach(tab => {
                        tab.classList.remove('active');
                        if (tab.dataset.view === 'all') {
                            tab.classList.add('active');
                        }
                    });
                    
                    // Search for this vendor
                    document.getElementById('vendorSearch').value = d.data.name;
                    updateAnalysis();
                }
            }
        })
        .on('mouseover', function(event, d) {
            const tooltip = d3.select('#tooltip');
            let content = `<strong>${d.data.name}</strong><br>`;
            content += `Amount: ${formatCurrency(d.value)}<br>`;
            content += `Share: ${(d.value / allTotal * 100).toFixed(1)}%`;
            
            tooltip.html(content)
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 10) + 'px')
                .style('opacity', 1);
        })
        .on('mouseout', function() {
            d3.select('#tooltip').style('opacity', 0);
        });
    
    // Add labels for large enough nodes
    nodes.each(function(d) {
        const node = d3.select(this);
        const width = d.x1 - d.x0;
        const height = d.y1 - d.y0;
        
        if (width > 50 && height > 30) {
            node.append('div')
                .attr('class', 'treemap-label')
                .text(d.data.name);
            
            if (height > 50) {
                node.append('div')
                    .attr('class', 'treemap-value')
                    .text(formatCurrency(d.value));
            }
        }
    });
    
    // Update pagination area with legend
    const paginationArea = document.getElementById('pagination');
    paginationArea.style.display = 'none';
}

// formatCurrency is now imported from common_utils.js

/**
 * Show loading state
 */
function showLoading() {
    document.getElementById('chart').innerHTML = 
        '<div class="loading">Loading vendor data...</div>';
}

/**
 * Show error message
 */
function showError(message) {
    document.getElementById('chart').innerHTML = 
        `<div class="error">${message}</div>`;
}

/**
 * Set up event handlers
 */
function setupEventHandlers() {
    // Filter changes
    document.getElementById('componentFilter').addEventListener('change', () => {
        updateTASFilter();
        currentPage = 1;
        updateAnalysis();
    });
    
    document.getElementById('tasFilter').addEventListener('change', () => {
        currentPage = 1;
        updateAnalysis();
    });
    
    document.getElementById('awardType').addEventListener('change', () => {
        currentPage = 1;
        updateAnalysis();
    });
    
    document.getElementById('pscFilter').addEventListener('change', () => {
        currentPage = 1;
        updateAnalysis();
    });
    
    document.getElementById('vendorSearch').addEventListener('input', () => {
        currentPage = 1;
        updateAnalysis();
    });
    
    document.getElementById('minAmount').addEventListener('change', () => {
        currentPage = 1;
        updateAnalysis();
    });
    
    document.getElementById('sortBy').addEventListener('change', () => {
        sortVendors();
        updateVisualization();
    });
    
    // View tabs
    document.querySelectorAll('.view-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            currentView = e.target.dataset.view;
            currentPage = 1;
            updateAnalysis();
        });
    });
    
    // Pagination
    document.getElementById('prevPage').addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            updateVisualization();
        }
    });
    
    document.getElementById('nextPage').addEventListener('click', () => {
        const totalPages = Math.ceil(getDisplayData().length / itemsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            updateVisualization();
        }
    });
}

// Make toggleVendorDetails globally accessible
window.toggleVendorDetails = toggleVendorDetails;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);