/**
 * DHS Vendor Analysis - Explore contractors and grantees over time
 */

// Global variables
let awardsData = [];
let filteredData = [];
let vendorComparison = [];
let currentView = 'comparison';
let currentPage = 1;
const itemsPerPage = 50;

// Load data on initialization
async function init() {
    try {
        showLoading();
        
        // Load awards data
        const response = await fetch('processed_data/usaspending/awards_flat.json');
        awardsData = await response.json();
        
        console.log(`Loaded ${awardsData.length} award records`);
        
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
 * Populate filter dropdowns
 */
function populateFilters() {
    // Components
    const components = [...new Set(awardsData.map(d => d.component))].sort();
    const componentSelect = document.getElementById('componentFilter');
    components.forEach(comp => {
        const option = document.createElement('option');
        option.value = comp;
        option.textContent = comp;
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
    
    // TAS will be populated based on component selection
    updateTASFilter();
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
    console.log('Sample filtered data:', filteredData.slice(0, 3));
    
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
    });
    
    // Create comparison array
    vendorComparison = [];
    
    Object.entries(vendorsByYear).forEach(([vendor, years]) => {
        const fy2023 = years[2023] || { obligations: 0, count: 0 };
        const fy2025 = years[2025] || { obligations: 0, count: 0 };
        
        const comparison = {
            vendor: vendor,
            fy2023_amount: fy2023.obligations,
            fy2025_amount: fy2025.obligations,
            fy2023_count: fy2023.count,
            fy2025_count: fy2025.count,
            change_amount: fy2025.obligations - fy2023.obligations,
            change_percent: fy2023.obligations > 0 ? 
                ((fy2025.obligations - fy2023.obligations) / fy2023.obligations) * 100 : 
                (fy2025.obligations > 0 ? 100 : 0),
            is_new: fy2023.obligations === 0 && fy2025.obligations > 0,
            is_lost: fy2023.obligations > 0 && fy2025.obligations === 0,
            state: fy2025.state || fy2023.state,
            components: [...new Set([...Array.from(fy2023.components || []), ...Array.from(fy2025.components || [])])],
            awardTypes: [...new Set([...Array.from(fy2023.awardTypes || []), ...Array.from(fy2025.awardTypes || [])])],
            yearData: years // Store full year data for detailed view
        };
        
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
        switch (sortBy) {
            case 'fy2025':
                return b.fy2025_amount - a.fy2025_amount;
            case 'fy2023':
                return b.fy2023_amount - a.fy2023_amount;
            case 'change':
                return b.change_amount - a.change_amount;
            case 'change_pct':
                return b.change_percent - a.change_percent;
            case 'name':
                return a.vendor.localeCompare(b.vendor);
            default:
                return b.fy2025_amount - a.fy2025_amount;
        }
    });
}

/**
 * Update statistics
 */
function updateStats() {
    // Filter based on current view
    let viewData = vendorComparison;
    
    switch (currentView) {
        case 'new':
            viewData = vendorComparison.filter(v => v.is_new);
            break;
        case 'lost':
            viewData = vendorComparison.filter(v => v.is_lost);
            break;
        case 'top-growth':
            viewData = vendorComparison
                .filter(v => v.change_percent > 0 && !v.is_new)
                .sort((a, b) => b.change_percent - a.change_percent)
                .slice(0, 50);
            break;
        case 'top-decline':
            viewData = vendorComparison
                .filter(v => v.change_percent < 0 && !v.is_lost)
                .sort((a, b) => a.change_percent - b.change_percent)
                .slice(0, 50);
            break;
    }
    
    // Calculate stats
    const totalVendors = viewData.filter(v => v.fy2025_amount > 0).length;
    const totalAmount2025 = viewData.reduce((sum, v) => sum + v.fy2025_amount, 0);
    const totalAmount2023 = viewData.reduce((sum, v) => sum + v.fy2023_amount, 0);
    const newVendorCount = vendorComparison.filter(v => v.is_new).length;
    
    const avgTransaction2025 = totalVendors > 0 ? totalAmount2025 / totalVendors : 0;
    const avgTransaction2023 = vendorComparison.filter(v => v.fy2023_amount > 0).length > 0 ?
        totalAmount2023 / vendorComparison.filter(v => v.fy2023_amount > 0).length : 0;
    
    // Update display
    document.getElementById('totalVendors').textContent = totalVendors.toLocaleString();
    document.getElementById('totalAmount').textContent = formatCurrency(totalAmount2025);
    document.getElementById('newVendors').textContent = newVendorCount.toLocaleString();
    document.getElementById('avgTransaction').textContent = formatCurrency(avgTransaction2025);
    
    // Change indicators
    const vendorChange = totalVendors - vendorComparison.filter(v => v.fy2023_amount > 0).length;
    document.getElementById('vendorChange').textContent = 
        (vendorChange >= 0 ? '+' : '') + vendorChange.toLocaleString() + ' vendors';
    document.getElementById('vendorChange').className = 
        'stat-change ' + (vendorChange >= 0 ? 'positive' : 'negative');
    
    const amountChange = ((totalAmount2025 - totalAmount2023) / totalAmount2023) * 100;
    document.getElementById('amountChange').textContent = 
        (amountChange >= 0 ? '+' : '') + amountChange.toFixed(1) + '% from FY 2023';
    document.getElementById('amountChange').className = 
        'stat-change ' + (amountChange >= 0 ? 'positive' : 'negative');
    
    const avgChange = ((avgTransaction2025 - avgTransaction2023) / avgTransaction2023) * 100;
    document.getElementById('avgChange').textContent = 
        (avgChange >= 0 ? '+' : '') + avgChange.toFixed(1) + '% from FY 2023';
    document.getElementById('avgChange').className = 
        'stat-change ' + (avgChange >= 0 ? 'positive' : 'negative');
}

/**
 * Update visualization
 */
function updateVisualization() {
    const container = document.getElementById('chart');
    
    // Filter data based on view
    let displayData = vendorComparison;
    
    switch (currentView) {
        case 'new':
            displayData = vendorComparison.filter(v => v.is_new);
            break;
        case 'lost':
            displayData = vendorComparison.filter(v => v.is_lost);
            break;
        case 'top-growth':
            displayData = vendorComparison
                .filter(v => v.change_percent > 0 && !v.is_new)
                .sort((a, b) => b.change_percent - a.change_percent)
                .slice(0, 50);
            break;
        case 'top-decline':
            displayData = vendorComparison
                .filter(v => v.change_percent < 0 && !v.is_lost)
                .sort((a, b) => a.change_percent - b.change_percent)
                .slice(0, 50);
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
    html += '<th>State</th>';
    html += '<th>FY 2023</th>';
    html += '<th>FY 2025</th>';
    html += '<th>Change ($)</th>';
    html += '<th>Change (%)</th>';
    html += '</tr></thead>';
    html += '<tbody>';
    
    pageData.forEach((vendor, index) => {
        html += `<tr data-index="${startIndex + index}">`;
        html += `<td class="vendor-name" onclick="toggleVendorDetails(${startIndex + index})">${vendor.vendor}</td>`;
        html += `<td>${vendor.state || '-'}</td>`;
        html += `<td class="amount">${formatCurrency(vendor.fy2023_amount)}</td>`;
        html += `<td class="amount">${formatCurrency(vendor.fy2025_amount)}`;
        
        // Add indicator
        if (vendor.is_new) {
            html += ' <span class="change-indicator new">NEW</span>';
        } else if (vendor.change_amount > 0) {
            html += ' <span class="change-indicator up"></span>';
        } else if (vendor.change_amount < 0) {
            html += ' <span class="change-indicator down"></span>';
        }
        
        html += '</td>';
        html += `<td class="amount ${vendor.change_amount >= 0 ? 'positive' : 'negative'}">${formatCurrency(vendor.change_amount)}</td>`;
        html += `<td class="amount ${vendor.change_percent >= 0 ? 'positive' : 'negative'}">`;
        
        if (vendor.is_new) {
            html += 'New';
        } else if (vendor.is_lost) {
            html += 'Lost';
        } else {
            html += vendor.change_percent.toFixed(1) + '%';
        }
        
        html += '</td>';
        html += '</tr>';
        
        // Add hidden details row
        html += `<tr id="details-${startIndex + index}" style="display: none;">`;
        html += '<td colspan="6"><div class="vendor-details" id="vendor-details-' + (startIndex + index) + '"></div></td>';
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
            .slice(0, 10);
        
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
            html += `<div class="detail-item"><span class="detail-value">${comp}</span></div>`;
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
            .slice(0, 5);
        
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
        
        detailsDiv.innerHTML = html;
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
        case 'new':
            return vendorComparison.filter(v => v.is_new);
        case 'lost':
            return vendorComparison.filter(v => v.is_lost);
        case 'top-growth':
            return vendorComparison
                .filter(v => v.change_percent > 0 && !v.is_new)
                .sort((a, b) => b.change_percent - a.change_percent)
                .slice(0, 50);
        case 'top-decline':
            return vendorComparison
                .filter(v => v.change_percent < 0 && !v.is_lost)
                .sort((a, b) => a.change_percent - b.change_percent)
                .slice(0, 50);
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
    const minAmount = document.getElementById('minAmount').value;
    
    let summary = 'Showing ';
    
    switch (currentView) {
        case 'new':
            summary += 'new vendors ';
            break;
        case 'lost':
            summary += 'lost vendors ';
            break;
        case 'top-growth':
            summary += 'top growing vendors ';
            break;
        case 'top-decline':
            summary += 'top declining vendors ';
            break;
        default:
            summary += 'all vendors ';
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
    
    if (minAmount && parseFloat(minAmount) > 0) {
        summary += `with awards ≥ ${formatCurrency(parseFloat(minAmount))}`;
    }
    
    document.getElementById('filterSummary').textContent = summary;
}

/**
 * Format currency
 */
function formatCurrency(amount) {
    if (amount >= 1e9) {
        return '$' + (amount / 1e9).toFixed(2) + 'B';
    } else if (amount >= 1e6) {
        return '$' + (amount / 1e6).toFixed(2) + 'M';
    } else if (amount >= 1e3) {
        return '$' + (amount / 1e3).toFixed(0) + 'K';
    } else {
        return '$' + amount.toFixed(0);
    }
}

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