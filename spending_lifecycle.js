// Spending Lifecycle Tracker for DHS Budget Data
// Combines apportionment data with USAspending obligation and outlay data

class SpendingLifecycleTracker {
    constructor() {
        this.apportionmentData = null;
        this.usaspendingData = null;
        this.currentView = 'component';
        this.filters = {
            fiscalYear: '2025',
            period: '9',
            component: 'all'
        };
        
        this.init();
    }
    
    async init() {
        // Set up event listeners
        this.setupEventListeners();
        
        // Load data
        await this.loadData();
        
        // Initial render
        this.updateView();
    }
    
    setupEventListeners() {
        // Control changes
        document.getElementById('fiscalYear').addEventListener('change', (e) => {
            this.filters.fiscalYear = e.target.value;
            this.updateView();
        });
        
        document.getElementById('period').addEventListener('change', (e) => {
            this.filters.period = e.target.value;
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
            // Load apportionment data
            const apportionmentResponse = await fetch('processed_data/appropriations/dhs_tas_aggregated_with_fund_types.csv');
            const apportionmentText = await apportionmentResponse.text();
            this.apportionmentData = this.parseCSV(apportionmentText);
            
            // Try to load USAspending data if available
            await this.loadUSAspendingData();
            
            // Populate component dropdown
            this.populateComponents();
            
        } catch (error) {
            console.error('Error loading data:', error);
            this.showError('Failed to load data. Please check the console for details.');
        }
    }
    
    async loadUSAspendingData() {
        // Try to load USAspending data for the selected period
        const baseDir = `raw_data/usaspending/FY${this.filters.fiscalYear}`;
        
        try {
            // Load File A (Account Balances)
            // For now, we'll use the specific file we have
            let filePath;
            if (this.filters.fiscalYear === '2025') {
                filePath = `${baseDir}/FY2025P01-P09_All_TAS_AccountBalances_2025-08-12_H10M36S53_1.csv`;
            } else if (this.filters.fiscalYear === '2023') {
                filePath = `${baseDir}/FY2023P01-P12_All_TAS_AccountBalances_2025-08-13_H14M06S00_1.csv`;
            } else {
                console.log(`No USAspending data available for FY${this.filters.fiscalYear}`);
                return;
            }
            
            const response = await fetch(filePath);
            if (response.ok) {
                const text = await response.text();
                this.usaspendingData = this.parseCSV(text);
                console.log('Loaded USAspending data:', this.usaspendingData.length, 'records');
            }
        } catch (error) {
            console.log('USAspending data not available for this period');
            this.usaspendingData = null;
        }
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
        
        this.apportionmentData.forEach(row => {
            if (row.bureau) {
                components.add(row.bureau);
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
        const quarter = Math.ceil(this.filters.period / 3);
        
        summary.textContent = `Showing: ${component} for FY ${this.filters.fiscalYear}, Period ${this.filters.period} (Q${quarter})`;
    }
    
    combineData() {
        // Filter apportionment data
        let filteredApportionment = this.apportionmentData.filter(row => {
            if (row.fiscal_year !== this.filters.fiscalYear) return false;
            if (this.filters.component !== 'all' && row.bureau !== this.filters.component) return false;
            return true;
        });
        
        // Create a map by TAS for easy lookup
        const apportionmentByTAS = new Map();
        filteredApportionment.forEach(row => {
            const key = row.tas;
            if (!apportionmentByTAS.has(key)) {
                apportionmentByTAS.set(key, {
                    tas: key,
                    bureau: row.bureau,
                    account: row.account,
                    fund_type: row.fund_type,
                    budget_category: row.budget_category,
                    apportionment: 0,
                    obligations_currentYear: 0,
                    outlays_currentYear: 0,
                    obligations_allYears: 0,
                    outlays_allYears: 0,
                    budgetAuthority_currentYear: 0
                });
            }
            apportionmentByTAS.get(key).apportionment += parseFloat(row.amount) || 0;
        });
        
        // If we have USAspending data, merge it
        if (this.usaspendingData) {
            this.usaspendingData.forEach(row => {
                // Parse the TAS from USAspending format
                const tasParts = this.parseTAS(row.treasury_account_symbol);
                if (!tasParts) return;
                
                const simpleTAS = `${tasParts.agency}-${tasParts.mainAccount}`;
                
                if (apportionmentByTAS.has(simpleTAS)) {
                    const record = apportionmentByTAS.get(simpleTAS);
                    
                    // Track all spending
                    record.obligations_allYears += parseFloat(row.obligations_incurred) || 0;
                    record.outlays_allYears += parseFloat(row.gross_outlay_amount) || 0;
                    
                    // Only count current FY appropriations for comparison
                    if (tasParts.beginYear === this.filters.fiscalYear && 
                        tasParts.endYear === this.filters.fiscalYear) {
                        record.obligations_currentYear += parseFloat(row.obligations_incurred) || 0;
                        record.outlays_currentYear += parseFloat(row.gross_outlay_amount) || 0;
                        record.budgetAuthority_currentYear += parseFloat(row.budget_authority_appropriated_amount) || 0;
                    }
                }
            });
            
            // Update the records to use current year values for display
            apportionmentByTAS.forEach(record => {
                record.obligations = record.obligations_currentYear;
                record.outlays = record.outlays_currentYear;
                record.budgetAuthority = record.budgetAuthority_currentYear;
            });
        }
        
        // Store the raw TAS data for drill-down
        this.tasData = Array.from(apportionmentByTAS.values());
        console.log('Stored TAS data:', this.tasData.length, 'records');
        if (this.tasData.length > 0) {
            console.log('Sample TAS record:', this.tasData[0]);
        }
        
        // Convert to array and aggregate by view type
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
                    key = `${row.tas} - ${row.account}`;
                    break;
                case 'fund_type':
                    key = row.fund_type;
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
                    bureau: row.bureau  // Store bureau for drill-down
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
            // Handle name variations (e.g., "U.S. Customs" vs "Customs")
            const componentTAS = this.tasData.filter(tas => {
                // Direct match
                if (tas.bureau === component || tas.bureau === row.dataset.bureau) {
                    return true;
                }
                
                // Handle U.S. prefix variations
                const normalizedComponent = component.replace('U.S. ', '');
                const normalizedBureau = tas.bureau.replace('U.S. ', '');
                
                return normalizedBureau === normalizedComponent || 
                       tas.bureau === `U.S. ${component}` ||
                       normalizedBureau.includes(normalizedComponent) ||
                       normalizedComponent.includes(normalizedBureau);
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
                
                // Determine execution status
                let executionClass = '';
                if (obligPercent > 90) executionClass = 'danger';
                else if (obligPercent > 75) executionClass = 'warning';
                
                const detailRow = document.createElement('tr');
                detailRow.className = 'tas-detail';
                detailRow.setAttribute('data-parent', component);
                
                detailRow.innerHTML = `
                    <td>
                        ${tas.tas} - ${tas.account}
                        <span class="execution-bar">
                            <span class="execution-fill ${executionClass}" style="width: ${Math.min(obligPercent, 100)}%"></span>
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
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new SpendingLifecycleTracker();
});