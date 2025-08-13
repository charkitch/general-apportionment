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
            const apportionmentResponse = await fetch('data/dhs_tas_aggregated_with_fund_types.csv');
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
        const baseDir = `usaspending_data/FY${this.filters.fiscalYear}_Q${Math.ceil(this.filters.period / 3)}`;
        
        try {
            // Load File A (Account Balances)
            const fileAPath = `${baseDir}/FY${this.filters.fiscalYear}P01-P${String(this.filters.period).padStart(2, '0')}_All_TAS_AccountBalances_*.csv`;
            // This is a simplified version - in reality we'd need to find the actual file
            
            // For now, check if we have the manually downloaded data
            const testPath = `FY2025P01-P09_All_TAS_AccountData_2025-08-12_H10M36S53426004/FY2025P01-P09_All_TAS_AccountBalances_2025-08-12_H10M36S53_1.csv`;
            
            const response = await fetch(testPath);
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
                    apportionment: 0
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
                    record.obligations = parseFloat(row.obligations_incurred) || 0;
                    record.outlays = parseFloat(row.gross_outlay_amount) || 0;
                    record.budgetAuthority = parseFloat(row.budget_authority_appropriated_amount) || 0;
                }
            });
        }
        
        // Convert to array and aggregate by view type
        const dataArray = Array.from(apportionmentByTAS.values());
        return this.aggregateByView(dataArray);
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
                    count: 0
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
        
        tbody.innerHTML = data.map(row => {
            const obligPercent = row.apportionment > 0 ? (row.obligations / row.apportionment * 100) : 0;
            const outlayPercent = row.apportionment > 0 ? (row.outlays / row.apportionment * 100) : 0;
            const executionPercent = row.obligations > 0 ? (row.outlays / row.obligations * 100) : 0;
            
            return `
                <tr>
                    <td>${row.name}</td>
                    <td class="amount">${this.formatCurrency(row.apportionment)}</td>
                    <td class="amount">${this.formatCurrency(row.obligations)}</td>
                    <td class="percent">${obligPercent.toFixed(1)}%</td>
                    <td class="amount">${this.formatCurrency(row.outlays)}</td>
                    <td class="percent">${outlayPercent.toFixed(1)}%</td>
                    <td class="percent">${executionPercent.toFixed(1)}%</td>
                </tr>
            `;
        }).join('');
        
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
        
        tbody.innerHTML += `
            <tr style="font-weight: bold; background: #f8f9fa;">
                <td>TOTAL</td>
                <td class="amount">${this.formatCurrency(totals.apportionment)}</td>
                <td class="amount">${this.formatCurrency(totals.obligations)}</td>
                <td class="percent">${totalObligPercent.toFixed(1)}%</td>
                <td class="amount">${this.formatCurrency(totals.outlays)}</td>
                <td class="percent">${totalOutlayPercent.toFixed(1)}%</td>
                <td class="percent">${totalExecutionPercent.toFixed(1)}%</td>
            </tr>
        `;
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
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new SpendingLifecycleTracker();
});