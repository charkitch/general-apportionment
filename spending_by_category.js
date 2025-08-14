// Spending by Category Treemap Visualization - Using Flat Data
let flatData = null;
let currentData = null;
let currentView = 'category-component';
let breadcrumbPath = [];

// Use the same colors as the budget treemap
const tableau20 = [
    '#1f77b4', '#aec7e8', '#ff7f0e', '#ffbb78', '#2ca02c',
    '#98df8a', '#d62728', '#ff9896', '#9467bd', '#c5b0d5',
    '#8c564b', '#c49c94', '#e377c2', '#f7b6d2', '#7f7f7f',
    '#c7c7c7', '#bcbd22', '#dbdb8d', '#17becf', '#9edae5'
];
const componentColors = d3.scaleOrdinal(tableau20);


// Load data and initialize
async function init() {
    try {
        // Load flat data
        const response = await fetch('processed_data/usaspending/spending_flat.json');
        flatData = await response.json();
        console.log('Loaded flat spending data:', flatData.length, 'records');
        
        // Load metadata for dropdown options
        const metaResponse = await fetch('processed_data/usaspending/spending_metadata.json');
        const metadata = await metaResponse.json();
        
        // Populate component dropdown
        const componentFilter = document.getElementById('componentFilter');
        metadata.components.forEach(component => {
            const option = document.createElement('option');
            option.value = component;
            option.textContent = component;
            componentFilter.appendChild(option);
        });
        
        // Set up event listeners
        setupEventListeners();
        
        // Initial render
        updateVisualization();
        
    } catch (error) {
        console.error('Error loading data:', error);
        document.getElementById('treemap').innerHTML = '<div style="padding: 20px; color: red;">Failed to load data</div>';
    }
}

function setupEventListeners() {
    ['fiscalYear', 'componentFilter', 'categoryFilter', 'aggregateBy'].forEach(id => {
        document.getElementById(id).addEventListener('change', updateVisualization);
    });
}

function filterData() {
    let filtered = [...flatData];
    
    // Filter by fiscal year
    const fiscalYear = document.getElementById('fiscalYear').value;
    filtered = filtered.filter(d => d.fiscal_year == fiscalYear);
    
    // Filter by component
    const component = document.getElementById('componentFilter').value;
    if (component !== 'all') {
        filtered = filtered.filter(d => d.component === component);
    }
    
    // Filter by category
    const category = document.getElementById('categoryFilter').value;
    if (category !== 'all') {
        filtered = filtered.filter(d => d.category === category);
    }
    
    return filtered;
}

function aggregateData(data, groupBy) {
    const aggregated = {};
    
    data.forEach(record => {
        const key = groupBy(record);
        if (!aggregated[key]) {
            aggregated[key] = {
                amount: 0,
                records: []
            };
        }
        aggregated[key].amount += record.amount;
        aggregated[key].records.push(record);
    });
    
    return aggregated;
}

function buildHierarchy(filteredData, viewType) {
    const root = {
        name: 'DHS Spending',
        children: []
    };
    
    switch (viewType) {
        case 'category-component':
            // Group by category first
            const byCategory = aggregateData(filteredData, d => d.category);
            
            Object.entries(byCategory).forEach(([category, catData]) => {
                const categoryNode = {
                    name: category,
                    category: category,
                    value: catData.amount,
                    label_category: category,
                    children: []
                };
                
                // Group by component within category
                const byComponent = aggregateData(catData.records, d => d.component);
                
                Object.entries(byComponent).forEach(([component, compData]) => {
                    const componentNode = {
                        name: component,
                        component: component,
                        category: category,
                        value: compData.amount,
                        label_component: component,
                        label_category: category,
                        children: compData.records.map(r => ({
                            name: r.tas,
                            tas: r.tas,
                            component: component,
                            category: category,
                            value: r.amount,
                            percentage_of_tas: r.percentage_of_tas,
                            label_component: r.label_component,
                            label_category: r.label_category,
                            label_tas: r.label_tas
                        }))
                    };
                    categoryNode.children.push(componentNode);
                });
                
                root.children.push(categoryNode);
            });
            break;
            
        case 'component-category':
            // Group by component first
            const byComponent = aggregateData(filteredData, d => d.component);
            
            Object.entries(byComponent).forEach(([component, compData]) => {
                const componentNode = {
                    name: component,
                    component: component,
                    value: compData.amount,
                    label_component: component,
                    children: []
                };
                
                // Group by category within component
                const byCategory = aggregateData(compData.records, d => d.category);
                
                Object.entries(byCategory).forEach(([category, catData]) => {
                    const categoryNode = {
                        name: category,
                        category: category,
                        component: component,
                        value: catData.amount,
                        label_component: component,
                        label_category: category,
                        children: catData.records.map(r => ({
                            name: r.tas,
                            tas: r.tas,
                            component: component,
                            category: category,
                            value: r.amount,
                            percentage_of_tas: r.percentage_of_tas,
                            label_component: r.label_component,
                            label_category: r.label_category,
                            label_tas: r.label_tas
                        }))
                    };
                    componentNode.children.push(categoryNode);
                });
                
                root.children.push(componentNode);
            });
            break;
            
        case 'category-only':
            // Just show categories (but aggregate across all components)
            const byCategoryOnly = aggregateData(filteredData, d => d.category);
            
            Object.entries(byCategoryOnly).forEach(([category, catData]) => {
                // Get all unique components in this category
                const components = [...new Set(catData.records.map(r => r.component))];
                root.children.push({
                    name: category,
                    category: category,
                    value: catData.amount,
                    // Use first component for color, or indicate it's mixed
                    component: components.length === 1 ? components[0] : 'Multiple',
                    components: components,
                    label_category: category,
                    label_component: components.length === 1 ? components[0] : `${components.length} agencies`
                });
            });
            break;
            
        case 'component-only':
            // Just show components
            const byComponentOnly = aggregateData(filteredData, d => d.component);
            
            Object.entries(byComponentOnly).forEach(([component, compData]) => {
                root.children.push({
                    name: component,
                    component: component,
                    value: compData.amount,
                    label_component: component
                });
            });
            break;
    }
    
    return root;
}

function getColor(node) {
    // Always use component colors
    if (node.component) {
        // For mixed components, use a neutral color
        if (node.component === 'Multiple') {
            return '#999';
        }
        return componentColors(node.component);
    }
    
    // This shouldn't happen anymore
    console.warn('Node without component:', node);
    return '#888';
}

function formatCurrency(value) {
    if (value >= 1e9) {
        return `$${(value / 1e9).toFixed(2)}B`;
    } else if (value >= 1e6) {
        return `$${(value / 1e6).toFixed(1)}M`;
    } else if (value >= 1e3) {
        return `$${(value / 1e3).toFixed(0)}K`;
    }
    return `$${value.toFixed(0)}`;
}

function updateVisualization() {
    const container = document.getElementById('treemap');
    container.innerHTML = '';
    
    // Get filtered data
    const filteredData = filterData();
    if (filteredData.length === 0) {
        container.innerHTML = '<div style="padding: 20px;">No data matching filters</div>';
        return;
    }
    
    // Build hierarchy based on view type
    const viewType = document.getElementById('aggregateBy').value;
    const hierarchyData = buildHierarchy(filteredData, viewType);
    
    // Update info
    const totalAmount = filteredData.reduce((sum, d) => sum + d.amount, 0);
    document.getElementById('totalAmount').textContent = formatCurrency(totalAmount);
    document.getElementById('currentYear').textContent = `FY ${document.getElementById('fiscalYear').value}`;
    
    // Create treemap
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    const treemap = d3.treemap()
        .size([width, height])
        .padding(1)
        .round(true);
    
    const root = d3.hierarchy(hierarchyData)
        .sum(d => d.value || 0)
        .sort((a, b) => b.value - a.value);
    
    treemap(root);
    
    // Create nodes - show all levels
    const nodes = root.descendants().filter(d => d.depth > 0);
    
    nodes.forEach(node => {
        const div = document.createElement('div');
        div.className = 'node';
        div.style.left = node.x0 + 'px';
        div.style.top = node.y0 + 'px';
        div.style.width = (node.x1 - node.x0) + 'px';
        div.style.height = (node.y1 - node.y0) + 'px';
        div.style.backgroundColor = getColor(node.data);
        
        // Add label if there's enough space
        const width = node.x1 - node.x0;
        const height = node.y1 - node.y0;
        
        if (width > 50 && height > 30) {
            const label = document.createElement('div');
            label.className = 'node-label';
            
            // Build label text from label fields
            let labelLines = [];
            
            // Use the pre-computed label fields
            if (node.data.label_component && node.data.label_component !== node.data.label_category) {
                labelLines.push(node.data.label_component);
            }
            
            if (node.data.label_category) {
                labelLines.push(node.data.label_category);
            }
            
            if (node.data.label_tas && labelLines.length === 0) {
                labelLines.push(node.data.label_tas);
            }
            
            // Fallback to name if no labels
            if (labelLines.length === 0) {
                labelLines.push(node.data.name);
            }
            
            label.innerHTML = `
                <div>${labelLines.join('<br>')}</div>
                ${height > 50 ? `<div class="node-value">${formatCurrency(node.data.value)}</div>` : ''}
            `;
            div.appendChild(label);
        }
        
        // Add hover tooltip
        div.addEventListener('mouseenter', (e) => showTooltip(e, node.data));
        div.addEventListener('mouseleave', hideTooltip);
        
        container.appendChild(div);
    });
    
    // Update legend
    updateLegend(viewType);
}

function showTooltip(event, data) {
    const tooltip = document.getElementById('tooltip');
    
    let content = `<strong>${data.name}</strong><br>`;
    content += `Total: ${formatCurrency(data.value)}<br>`;
    
    if (data.category) {
        content += `Category: ${data.category}<br>`;
    }
    
    if (data.component && data.component !== data.name) {
        content += `Component: ${data.component}<br>`;
    }
    
    if (data.percentage_of_tas !== undefined) {
        content += `${data.percentage_of_tas.toFixed(1)}% of TAS total`;
    }
    
    tooltip.innerHTML = content;
    tooltip.style.opacity = 1;
    
    // Position tooltip
    const rect = event.target.getBoundingClientRect();
    tooltip.style.left = rect.left + 'px';
    tooltip.style.top = (rect.top - tooltip.offsetHeight - 5) + 'px';
}

function hideTooltip() {
    document.getElementById('tooltip').style.opacity = 0;
}

function updateLegend(viewType) {
    const content = document.getElementById('legend-content');
    content.innerHTML = '';
    
    // Always show component colors since that's what we're using
    const components = new Set();
    if (flatData) {
        flatData.forEach(d => components.add(d.component));
    }
    
    Array.from(components).sort().forEach(component => {
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML = `
            <div class="legend-color" style="background: ${componentColors(component)}"></div>
            <span>${component}</span>
        `;
        content.appendChild(item);
    });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);