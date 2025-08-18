// Spending Lifecycle Tracker for DHS Budget Data
// Combines apportionment data with USAspending obligation and outlay data

class SpendingLifecycleTracker {
    constructor() {
        this.detailedData = null;
        this.currentView = 'component';
        this.filters = {
            fiscalYear: '2025',  // Default to FY 2025
            availabilityType: 'all',
            component: 'all'
        };
        
        this.init();
    }
    
    async init() {
        // Load configuration first
        await this.loadConfig();
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Load data
        await this.loadData();
        
        // Initial render
        this.updateView();
    }
    
    async loadConfig() {
        try {
            // Load YAML configuration
            const response = await fetch('config/data_schema.yaml');
            const yamlText = await response.text();
            if (typeof jsyaml !== 'undefined') {
                this.config = jsyaml.load(yamlText);
                
                // Set default fiscal year from config
                const defaultYear = this.config?.analysis_settings?.comparison_years?.default;
                if (defaultYear) {
                    this.filters.fiscalYear = defaultYear.toString();
                }
            }
        } catch (error) {
            console.warn('Could not load configuration:', error);
        }
    }
    
    setupEventListeners() {
        // Control changes
        document.getElementById('fiscalYear').addEventListener('change', (e) => {
            this.filters.fiscalYear = e.target.value;
            this.updateView();
        });
        
        document.getElementById('availabilityType').addEventListener('change', (e) => {
            this.filters.availabilityType = e.target.value;
            this.updateView();
        });
        
        document.getElementById('component').addEventListener('change', (e) => {
            this.filters.component = e.target.value;
            this.updateView();
        });
        
        document.getElementById('viewBy').addEventListener('change', (e) => {
            this.currentView = e.target.value;
            this.updateView();
        });
        
        // Lifecycle stage clicks
        document.querySelectorAll('.lifecycle-stage').forEach(stage => {
            stage.addEventListener('click', (e) => {
                document.querySelectorAll('.lifecycle-stage').forEach(s => s.classList.remove('active'));
                stage.classList.add('active');
                // Could add filtering by stage here
            });
        });
    }
    
    async loadData() {
        try {
            // Load the combined spending lifecycle data
            const response = await fetch('processed_data/spending_lifecycle/spending_lifecycle_data.json');
            const data = await response.json();
            
            this.detailedData = data.records;
            console.log(`Loaded ${this.detailedData.length} spending lifecycle records`);
            
            // Populate dropdowns
            this.populateComponents();
            this.populateFiscalYears();
            
        } catch (error) {
            console.error('Error loading data:', error);
            this.showError('Failed to load data. Please check the console for details.');
        }
    }
    
    getFilteredData() {
        // Filter the detailed data based on current filters
        return this.detailedData.filter(record => {
            // Filter by fiscal year (apportionment fiscal year)
            if (this.filters.fiscalYear !== 'all' && 
                record.apportionment_fy != this.filters.fiscalYear) {
                return false;
            }
            
            // Filter by availability type (case-insensitive comparison)
            if (this.filters.availabilityType !== 'all') {
                const recordType = (record.availability_type || '').toLowerCase().replace('-', '');
                const filterType = this.filters.availabilityType.toLowerCase().replace('-', '');
                if (recordType !== filterType) {
                    return false;
                }
            }
            
            // Filter by component
            if (this.filters.component !== 'all' && 
                record.bureau !== this.filters.component) {
                return false;
            }
            
            return true;
        });
    }
    
    parseCSV(text) {
        const lines = text.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        
        return lines.slice(1).map(line => {
            const values = [];
            let current = '';
            let inQuotes = false;
            
            for (let char of line) {
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    values.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            }
            values.push(current.trim());
            
            const row = {};
            headers.forEach((header, i) => {
                row[header] = values[i] || '';
            });
            return row;
        });
    }
    
    populateComponents() {
        const components = new Set();
        
        this.detailedData.forEach(record => {
            if (record.bureau) {
                components.add(record.bureau);
            }
        });
        
        const select = document.getElementById('component');
        select.innerHTML = '<option value="all">All Components</option>';
        
        Array.from(components).sort().forEach(component => {
            const option = document.createElement('option');
            option.value = component;
            option.textContent = component;
            select.appendChild(option);
        });
    }
    
    updateView() {
        // Update filter summary
        this.updateFilterSummary();
        
        // Process and combine data
        const combinedData = this.combineData();
        
        // Update lifecycle stages
        this.updateLifecycleStages(combinedData);
        
        // Update table
        this.updateTable(combinedData);
    }
    
    updateFilterSummary() {
        const summary = document.getElementById('filterSummary');
        const component = this.filters.component === 'all' ? 'All Components' : this.filters.component;
        const availType = this.filters.availabilityType === 'all' ? 'All Funds' : 
            this.filters.availabilityType.charAt(0).toUpperCase() + this.filters.availabilityType.slice(1) + ' Funds';
        
        summary.textContent = `Showing: ${component} for FY ${this.filters.fiscalYear}, ${availType}`;
    }
    
    combineData() {
        // Get filtered data
        const filteredData = this.getFilteredData();
        
        // Create a map for TAS-level data (for drill-down)
        const tasByKey = new Map();
        
        filteredData.forEach(record => {
            // Create a unique key for each TAS + availability period
            const key = `${record.tas}|${record.availability_period}`;
            
            if (!tasByKey.has(key)) {
                tasByKey.set(key, {
                    tas: record.tas,
                    tas_full: `${record.tas}-${record.availability_period}`,
                    availability_period: record.availability_period,
                    bureau: record.bureau,
                    account: record.account_name,
                    fund_type: record.fund_type,
                    availability_type: record.availability_type,
                    budget_category: record.budget_category,
                    apportionment: 0,
                    obligations: 0,
                    outlays: 0,
                    budget_authority: 0
                });
            }
            
            const tasData = tasByKey.get(key);
            tasData.apportionment += record.apportionment_amount || 0;
            tasData.obligations += record.obligations || 0;
            tasData.outlays += record.outlays || 0;
            tasData.budget_authority += record.budget_authority || 0;
        });
        
        // Store the TAS data for drill-down
        this.tasData = Array.from(tasByKey.values());
        console.log('Filtered data:', filteredData.length, 'records');
        console.log('Aggregated to TAS level:', this.tasData.length, 'unique TAS/period combinations');
        
        // Aggregate by view type
        return this.aggregateByView(this.tasData);
    }
    
    parseTAS(tas) {
        if (!tas) return null;
        
        // Handle format: 070-2024/2024-0112-000
        const match = tas.match(/(\d{3})-(\d{4})\/(\d{4})-(\d{4})-(\d{3})/);
        if (match) {
            return {
                agency: match[1],
                beginYear: match[2],
                endYear: match[3],
                mainAccount: match[4],
                subAccount: match[5]
            };
        }
        return null;
    }
    
    aggregateByView(data) {
        const aggregated = new Map();
        
        data.forEach(row => {
            let key;
            switch (this.currentView) {
                case 'component':
                    key = row.bureau;
                    break;
                case 'account':
                    key = `${row.bureau} - ${row.account}`;
                    break;
                case 'tas':
                    key = `${row.tas_full} - ${row.account}`;
                    break;
                case 'fund_type':
                    key = row.fund_type;
                    break;
                case 'availability_type':
                    key = row.availability_type;
                    break;
                default:
                    key = row.bureau;
            }
            
            if (!aggregated.has(key)) {
                aggregated.set(key, {
                    name: key,
                    apportionment: 0,
                    obligations: 0,
                    outlays: 0,
                    count: 0,
                    bureau: row.bureau,  // Store bureau for drill-down
                    availability_type: row.availability_type  // Store for additional context
                });
            }
            
            const agg = aggregated.get(key);
            agg.apportionment += row.apportionment;
            agg.obligations += row.obligations || 0;
            agg.outlays += row.outlays || 0;
            agg.count += 1;
        });
        
        return Array.from(aggregated.values()).sort((a, b) => b.apportionment - a.apportionment);
    }
    
    updateLifecycleStages(data) {
        const totals = data.reduce((acc, row) => {
            acc.apportionment += row.apportionment;
            acc.obligations += row.obligations;
            acc.outlays += row.outlays;
            return acc;
        }, { apportionment: 0, obligations: 0, outlays: 0 });
        
        // Update amounts
        document.getElementById('apportionment-amount').textContent = this.formatCurrency(totals.apportionment);
        document.getElementById('obligation-amount').textContent = this.formatCurrency(totals.obligations);
        document.getElementById('outlay-amount').textContent = this.formatCurrency(totals.outlays);
        
        // Update percentages
        const obligationPercent = totals.apportionment > 0 ? (totals.obligations / totals.apportionment * 100) : 0;
        const outlayPercent = totals.apportionment > 0 ? (totals.outlays / totals.apportionment * 100) : 0;
        
        document.getElementById('obligation-percent').textContent = `${obligationPercent.toFixed(1)}%`;
        document.getElementById('outlay-percent').textContent = `${outlayPercent.toFixed(1)}%`;
    }
    
    updateTable(data) {
        // Update headers
        const headers = document.getElementById('tableHeaders');
        headers.innerHTML = `
            <tr>
                <th>${this.getViewLabel()}</th>
                <th class="amount">Apportionment</th>
                <th class="amount">Obligations</th>
                <th class="percent">Oblig %</th>
                <th class="amount">Outlays</th>
                <th class="percent">Outlay %</th>
                <th class="percent">Execution %</th>
            </tr>
        `;
        
        // Update body
        const tbody = document.getElementById('tableBody');
        
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px;">No data available for selected filters</td></tr>';
            return;
        }
        
        // Check if we're viewing by component and have TAS data
        const canExpand = this.currentView === 'component' && this.tasData && this.tasData.length > 0;
        console.log('Can expand?', canExpand, 'View:', this.currentView, 'TAS data:', this.tasData?.length);
        
        tbody.innerHTML = data.map((row, index) => {
            const obligPercent = row.apportionment > 0 ? (row.obligations / row.apportionment * 100) : 0;
            const outlayPercent = row.apportionment > 0 ? (row.outlays / row.apportionment * 100) : 0;
            const executionPercent = row.obligations > 0 ? (row.outlays / row.obligations * 100) : 0;
            
            const expandIcon = canExpand ? '<span class="expand-icon">▶</span> ' : '';
            const expandClass = canExpand ? 'expandable' : '';
            
            return `
                <tr class="${expandClass}" data-component="${row.name}" data-bureau="${row.bureau || row.name}" data-index="${index}">
                    <td>${expandIcon}${row.name}</td>
                    <td class="amount">${this.formatCurrency(row.apportionment)}</td>
                    <td class="amount">${this.formatCurrency(row.obligations)}</td>
                    <td class="percent">${obligPercent.toFixed(1)}%</td>
                    <td class="amount">${this.formatCurrency(row.outlays)}</td>
                    <td class="percent">${outlayPercent.toFixed(1)}%</td>
                    <td class="percent">${executionPercent.toFixed(1)}%</td>
                </tr>
            `;
        }).join('');
        
        // Add click handlers for expandable rows
        if (canExpand) {
            const expandableRows = tbody.querySelectorAll('tr.expandable');
            console.log('Adding click handlers to', expandableRows.length, 'rows');
            expandableRows.forEach(row => {
                row.addEventListener('click', (e) => {
                    e.stopPropagation();
                    console.log('Row clicked:', e.currentTarget.dataset.component);
                    console.log('This context:', this);
                    this.toggleTASDetails(e.currentTarget);
                });
            });
        } else {
            console.log('Not adding click handlers - canExpand is false');
        }
        
        // Add totals row
        const totals = data.reduce((acc, row) => {
            acc.apportionment += row.apportionment;
            acc.obligations += row.obligations;
            acc.outlays += row.outlays;
            return acc;
        }, { apportionment: 0, obligations: 0, outlays: 0 });
        
        const totalObligPercent = totals.apportionment > 0 ? (totals.obligations / totals.apportionment * 100) : 0;
        const totalOutlayPercent = totals.apportionment > 0 ? (totals.outlays / totals.apportionment * 100) : 0;
        const totalExecutionPercent = totals.obligations > 0 ? (totals.outlays / totals.obligations * 100) : 0;
        
        // Create totals row without using innerHTML to preserve event listeners
        const totalsRow = document.createElement('tr');
        totalsRow.style.fontWeight = 'bold';
        totalsRow.style.background = '#f8f9fa';
        totalsRow.innerHTML = `
            <td>TOTAL</td>
            <td class="amount">${this.formatCurrency(totals.apportionment)}</td>
            <td class="amount">${this.formatCurrency(totals.obligations)}</td>
            <td class="percent">${totalObligPercent.toFixed(1)}%</td>
            <td class="amount">${this.formatCurrency(totals.outlays)}</td>
            <td class="percent">${totalOutlayPercent.toFixed(1)}%</td>
            <td class="percent">${totalExecutionPercent.toFixed(1)}%</td>
        `;
        tbody.appendChild(totalsRow);
    }
    
    getViewLabel() {
        switch (this.currentView) {
            case 'component': return 'Component';
            case 'account': return 'Federal Account';
            case 'tas': return 'Treasury Account Symbol';
            case 'fund_type': return 'Fund Type';
            case 'availability_type': return 'Availability Type';
            default: return 'Name';
        }
    }
    
    formatCurrency(amount) {
        if (amount === 0 || !amount) return '$0';
        
        const absAmount = Math.abs(amount);
        let formatted;
        
        if (absAmount >= 1e9) {
            formatted = `$${(amount / 1e9).toFixed(2)}B`;
        } else if (absAmount >= 1e6) {
            formatted = `$${(amount / 1e6).toFixed(1)}M`;
        } else if (absAmount >= 1e3) {
            formatted = `$${(amount / 1e3).toFixed(0)}K`;
        } else {
            formatted = `$${amount.toFixed(0)}`;
        }
        
        return formatted;
    }
    
    showError(message) {
        const container = document.querySelector('.container');
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error';
        errorDiv.textContent = message;
        container.insertBefore(errorDiv, container.firstChild);
    }
    
    toggleTASDetails(row) {
        const component = row.dataset.component;
        const isExpanded = row.classList.contains('expanded');
        
        console.log('Toggle TAS details for:', component, 'isExpanded:', isExpanded);
        console.log('Available TAS data:', this.tasData?.length || 0);
        
        // Remove any existing detail rows
        const existingDetails = row.parentNode.querySelectorAll(`tr[data-parent="${component}"]`);
        existingDetails.forEach(tr => tr.remove());
        
        if (!isExpanded) {
            row.classList.add('expanded');
            
            // Get TAS data for this component
            const componentTAS = this.tasData.filter(tas => {
                return tas.bureau === component || tas.bureau === row.dataset.bureau;
            });
            console.log('Found TAS for component:', componentTAS.length);
            
            if (componentTAS.length === 0) {
                console.log('No TAS found. Available bureaus:', [...new Set(this.tasData.map(t => t.bureau))]);
            }
            
            // Sort by obligation rate (descending) to show most active first
            componentTAS.sort((a, b) => {
                const aRate = a.apportionment > 0 ? (a.obligations / a.apportionment) : 0;
                const bRate = b.apportionment > 0 ? (b.obligations / b.apportionment) : 0;
                return bRate - aRate;
            });
            
            // Insert detail rows after the parent row
            let insertAfter = row;
            componentTAS.forEach(tas => {
                const obligPercent = tas.apportionment > 0 ? (tas.obligations / tas.apportionment * 100) : 0;
                const outlayPercent = tas.apportionment > 0 ? (tas.outlays / tas.apportionment * 100) : 0;
                const executionPercent = tas.obligations > 0 ? (tas.outlays / tas.obligations * 100) : 0;
                
                const detailRow = document.createElement('tr');
                detailRow.className = 'tas-detail';
                detailRow.setAttribute('data-parent', component);
                
                detailRow.innerHTML = `
                    <td>
                        ${tas.tas_full} - ${tas.account} (${tas.availability_type})
                        <span class="execution-bar">
                            <span class="execution-fill" style="width: ${Math.min(obligPercent, 100)}%"></span>
                        </span>
                    </td>
                    <td class="amount">${this.formatCurrency(tas.apportionment)}</td>
                    <td class="amount">${this.formatCurrency(tas.obligations)}</td>
                    <td class="percent">${obligPercent.toFixed(1)}%</td>
                    <td class="amount">${this.formatCurrency(tas.outlays)}</td>
                    <td class="percent">${outlayPercent.toFixed(1)}%</td>
                    <td class="percent">${executionPercent.toFixed(1)}%</td>
                `;
                
                insertAfter.insertAdjacentElement('afterend', detailRow);
                insertAfter = detailRow;
            });
        } else {
            row.classList.remove('expanded');
        }
    }
    
    updateFilterSummary() {
        const summaryEl = document.getElementById('filterSummary');
        if (!summaryEl) return;
        
        let summary = 'Showing: ';
        
        // Component
        if (this.filters.component === 'all') {
            summary += 'All Components';
        } else {
            summary += this.filters.component;
        }
        
        // Fiscal Year
        if (this.filters.fiscalYear !== 'all') {
            summary += ` for FY ${this.filters.fiscalYear}`;
        }
        
        // Availability Type - use standardized capitalization
        if (this.filters.availabilityType !== 'all') {
            const typeMap = {
                'annual': 'Annual',
                'multi-year': 'Multi-Year',
                'no-year': 'No-Year'
            };
            summary += `, ${typeMap[this.filters.availabilityType] || this.filters.availabilityType}`;
        }
        
        summaryEl.textContent = summary;
    }
    
    populateFiscalYears() {
        // Get unique fiscal years from data
        const years = [...new Set(this.detailedData.map(d => d.apportionment_fy))]
            .filter(y => y)
            .sort((a, b) => a - b);  // Sort ascending
        
        const select = document.getElementById('fiscalYear');
        select.innerHTML = '';
        
        // Add individual years
        years.forEach(year => {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = `FY ${year}`;
            // Set selected based on filter (default to 2025)
            if (year.toString() === this.filters.fiscalYear) {
                option.selected = true;
            }
            select.appendChild(option);
        });
        
        // If default year not in list, select the latest year
        if (!years.includes(parseInt(this.filters.fiscalYear))) {
            this.filters.fiscalYear = years[years.length - 1].toString();
            select.value = this.filters.fiscalYear;
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new SpendingLifecycleTracker();
});