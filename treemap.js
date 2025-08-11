// Global variables
let flatData = null;
let currentView = 'bureau-only';
let currentData = null;
let breadcrumbPath = [];

// Bureau colors - Tableau 20
const tableau20 = [
    '#1f77b4', '#aec7e8', '#ff7f0e', '#ffbb78', '#2ca02c',
    '#98df8a', '#d62728', '#ff9896', '#9467bd', '#c5b0d5',
    '#8c564b', '#c49c94', '#e377c2', '#f7b6d2', '#7f7f7f',
    '#c7c7c7', '#bcbd22', '#dbdb8d', '#17becf', '#9edae5'
];
const bureauColors = d3.scaleOrdinal(tableau20);

// View configurations
const VIEW_CONFIGS = {
    'bureau-only': {
        name: 'Component Total',
        hierarchy: ['bureau'],
        groupBy: (record) => ({
            bureau: record.bureau
        }),
        nodeData: {
            bureau: (record) => ({
                name: record.bureau,
                bureau: record.bureau,
                bureau_full: record.bureau_full,
                abbreviation: record.abbreviation
            })
        },
        labelFieldsByLevel: {
            bureau: ['bureau']
        },
        tooltipFields: ['bureau']
    },
    'default': {
        name: 'Component → Account → TAS',
        hierarchy: ['bureau', 'account', 'tas'],
        groupBy: (record) => ({
            bureau: record.bureau,
            account: `${record.bureau}|${record.account}`,
            tas: `${record.bureau}|${record.account}|${record.tas}`
        }),
        nodeData: {
            bureau: (record) => ({
                name: record.bureau,
                bureau: record.bureau,
                bureau_full: record.bureau_full,
                abbreviation: record.abbreviation
            }),
            account: (record) => ({
                name: record.account,
                bureau: record.bureau,
                bureau_full: record.bureau_full,
                abbreviation: record.abbreviation,
                account: record.account
            }),
            tas: (record) => ({
                name: record.tas,
                bureau: record.bureau,
                bureau_full: record.bureau_full,
                abbreviation: record.abbreviation,
                account: record.account,
                tas: record.tas,
                tas_full: record.tas_full,
                amount: record.amount,
                fiscal_year: record.fiscal_year,
                availability_type: record.availability_type
            })
        },
        // Label fields by level
        labelFieldsByLevel: {
            bureau: ['bureau'],
            account: ['bureau', 'account'],
            tas: ['bureau', 'account', 'tas']
        },
        tooltipFields: ['bureau', 'account', 'tas', 'availability_period', 'fiscal_year']
    },
    'no-tas': {
        name: 'Component → Account',
        hierarchy: ['bureau', 'account'],
        groupBy: (record) => ({
            bureau: record.bureau,
            account: `${record.bureau}|${record.account}`
        }),
        nodeData: {
            bureau: (record) => ({
                name: record.bureau,
                bureau: record.bureau,
                bureau_full: record.bureau_full,
                abbreviation: record.abbreviation
            }),
            account: (record) => ({
                name: record.account,
                bureau: record.bureau,
                bureau_full: record.bureau_full,
                abbreviation: record.abbreviation,
                account: record.account
            })
        },
        labelFieldsByLevel: {
            bureau: ['bureau'],
            account: ['bureau', 'account']
        },
        tooltipFields: ['bureau', 'account', 'fiscal_year']
    },
    'by-year': {
        name: 'Component → Fiscal Year',
        hierarchy: ['bureau', 'fiscal_year'],
        groupBy: (record) => ({
            bureau: record.bureau,
            fiscal_year: `${record.bureau}|${record.fiscal_year}`
        }),
        nodeData: {
            bureau: (record) => ({
                name: record.bureau,
                bureau: record.bureau,
                bureau_full: record.bureau_full,
                abbreviation: record.abbreviation
            }),
            fiscal_year: (record) => ({
                name: `FY ${record.fiscal_year}`,
                bureau: record.bureau,
                bureau_full: record.bureau_full,
                abbreviation: record.abbreviation,
                fiscal_year: record.fiscal_year
            })
        },
        labelFieldsByLevel: {
            bureau: ['bureau'],
            fiscal_year: ['bureau', 'fiscal_year']
        },
        tooltipFields: ['bureau', 'fiscal_year', 'availability_type']
    },
    'tas': {
        name: 'Component → Account → Fiscal Year',
        hierarchy: ['bureau', 'account', 'fiscal_year'],
        groupBy: (record) => ({
            bureau: record.bureau,
            account: `${record.bureau}|${record.account}`,
            fiscal_year: `${record.bureau}|${record.account}|${record.fiscal_year}`
        }),
        nodeData: {
            bureau: (record) => ({
                name: record.bureau,
                bureau: record.bureau,
                bureau_full: record.bureau_full,
                abbreviation: record.abbreviation
            }),
            account: (record) => ({
                name: record.account,
                bureau: record.bureau,
                bureau_full: record.bureau_full,
                abbreviation: record.abbreviation,
                account: record.account
            }),
            fiscal_year: (record) => ({
                name: `FY ${record.fiscal_year}`,
                bureau: record.bureau,
                bureau_full: record.bureau_full,
                abbreviation: record.abbreviation,
                account: record.account,
                fiscal_year: record.fiscal_year,
                tas: record.tas,
                tas_full: record.tas_full
            })
        },
        labelFieldsByLevel: {
            bureau: ['bureau'],
            account: ['bureau', 'account'],
            fiscal_year: ['bureau', 'account', 'fiscal_year']
        },
        tooltipFields: ['bureau', 'account', 'tas', 'fiscal_year', 'availability_period']
    }
};

// Load flat data
console.log('Starting to load flat data...');
Promise.all([
    d3.json('data/dhs_budget_flat.json')
]).then(([data]) => {
    console.log('Flat data loaded successfully');
    console.log('Total records:', data.record_count);
    console.log('Fiscal years:', data.fiscal_years);
    console.log('Availability types:', data.availability_types);
    
    flatData = data;
    
    // Populate component filter
    const componentSelect = d3.select('#componentFilter');
    data.bureaus.forEach(bureau => {
        componentSelect.append('option')
            .attr('value', bureau)
            .text(bureau);
    });
    
    // Initialize
    updateVisualization();
    
    // Check for update metadata
    d3.json('data/update_metadata.json').then(updateMeta => {
        if (updateMeta && updateMeta.last_updated) {
            const updateDate = new Date(updateMeta.last_updated);
            const formattedDate = updateDate.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            
            // Add last updated info
            const infoDiv = d3.select('#info');
            infoDiv.append('div')
                .attr('class', 'stat')
                .html(`<span class="stat-label">Data Last Pulled from OpenOMB:</span> <span class="stat-value">${formattedDate}</span>`);
        }
    }).catch(err => console.log('No update metadata found'));
    
    // Remove loading message
    d3.select('#treemap').select('.loading').remove();
}).catch(error => {
    console.error('Error loading data:', error);
    d3.select('#treemap').select('.loading').text('Error loading data');
});

// Event handlers
d3.select('#componentFilter').on('change', updateVisualization);
d3.select('#yearFilter').on('change', updateVisualization);
d3.select('#availabilityFilter').on('change', updateVisualization);
d3.select('#aggregateBy').on('change', () => {
    currentView = d3.select('#aggregateBy').property('value');
    navigateToRoot();
});
d3.select('#resetFilters').on('click', () => {
    d3.select('#componentFilter').property('value', 'all');
    d3.select('#yearFilter').property('value', 'all');
    d3.select('#availabilityFilter').property('value', 'all');
    d3.select('#aggregateBy').property('value', 'bureau-only');
    currentView = 'bureau-only';
    navigateToRoot();
});

function navigateToRoot() {
    breadcrumbPath = [];
    updateBreadcrumb();
    updateVisualization();
}

function buildHierarchy(records, viewKey) {
    const config = VIEW_CONFIGS[viewKey];
    if (!config) {
        console.error(`Unknown view: ${viewKey}`);
        return { name: 'DHS Total', children: [] };
    }
    
    // Filter records based on component, year and availability filters
    const componentFilter = d3.select('#componentFilter').property('value');
    const yearFilter = d3.select('#yearFilter').property('value');
    const availFilter = d3.select('#availabilityFilter').property('value');
    
    const filteredRecords = records.filter(r => {
        if (componentFilter !== 'all' && r.bureau !== componentFilter) return false;
        if (yearFilter !== 'all' && r.fiscal_year.toString() !== yearFilter) return false;
        if (availFilter !== 'all' && r.availability_type !== availFilter) return false;
        return true;
    });
    
    // Build hierarchy using configuration
    const root = { name: 'All Components', children: [] };
    const hierarchyLevels = {};
    
    // Initialize hierarchy levels
    config.hierarchy.forEach(level => {
        hierarchyLevels[level] = new Map();
    });
    
    // Build nested structure
    filteredRecords.forEach(record => {
        const groupKeys = config.groupBy(record);
        let path = [root];
        
        config.hierarchy.forEach((level, levelIndex) => {
            const groupKey = groupKeys[level];
            const parent = path[path.length - 1];
            
            // Find or create child node
            let node = parent.children?.find(child => {
                // Match based on the unique key for this level
                if (level === 'bureau') return child.bureau === record.bureau;
                if (level === 'account') return child.account === record.account && child.bureau === record.bureau;
                if (level === 'fiscal_year') return child.fiscal_year === record.fiscal_year;
                if (level === 'tas') return child.tas === record.tas;
                return child.name === config.nodeData[level](record).name;
            });
            
            if (!node) {
                // Create new node
                const nodeData = config.nodeData[level](record);
                node = {
                    ...nodeData,
                    level: level
                };
                
                if (levelIndex < config.hierarchy.length - 1) {
                    // Not a leaf - add children array
                    node.children = [];
                } else {
                    // Leaf node - initialize amount
                    node.amount = 0;
                }
                
                parent.children.push(node);
            }
            
            path.push(node);
        });
        
        // Add amount to leaf node
        const leafNode = path[path.length - 1];
        if (leafNode && leafNode.amount !== undefined) {
            leafNode.amount += record.amount;
        }
    });
    
    return root;
}

function updateVisualization() {
    if (!flatData) return;
    
    // Build hierarchy from flat data
    const hierarchyData = buildHierarchy(flatData.data, currentView);
    
    // Navigate to current breadcrumb level
    let displayData = hierarchyData;
    for (let step of breadcrumbPath) {
        const found = displayData.children?.find(d => d.name === step);
        if (!found) {
            navigateToRoot();
            return;
        }
        displayData = found;
    }
    
    currentData = displayData;
    
    // Create hierarchy and draw
    const hierarchy = d3.hierarchy(displayData)
        .sum(d => d.children ? 0 : (d.value || d.amount || 0))
        .sort((a, b) => b.value - a.value);
    
    drawTreemap(hierarchy);
    updateInfo(hierarchy);
}

function drawTreemap(hierarchyData) {
    const container = d3.select('#treemap');
    const width = container.node().offsetWidth;
    const height = container.node().offsetHeight;
    
    // Clear previous
    container.selectAll('.node').remove();
    
    // Create treemap layout
    const treemap = d3.treemap()
        .size([width, height])
        .padding(2)
        .round(true);
    
    treemap(hierarchyData);
    
    // Create nodes - use descendants() instead of leaves() to show all levels
    const nodes = container.selectAll('.node')
        .data(hierarchyData.descendants().filter(d => d.depth > 0))
        .enter()
        .append('div')
        .attr('class', 'node')
        .style('left', d => d.x0 + 'px')
        .style('top', d => d.y0 + 'px')
        .style('width', d => Math.max(0, d.x1 - d.x0) + 'px')
        .style('height', d => Math.max(0, d.y1 - d.y0) + 'px')
        .style('background-color', d => getNodeColor(d))
        .on('click', (event, d) => handleNodeClick(d))
        .on('mouseover', (event, d) => showTooltip(event, d))
        .on('mouseout', hideTooltip);
    
    // Add labels
    nodes.append('div')
        .attr('class', 'node-label')
        .html(d => {
            const width = d.x1 - d.x0;
            const height = d.y1 - d.y0;
            if (width < 50 || height < 30) return '';
            
            const data = d.data;
            
            // Build the label dynamically based on configuration
            const config = VIEW_CONFIGS[currentView];
            let label = '';
            
            if (config && config.labelFieldsByLevel && data.level) {
                const fieldsToShow = config.labelFieldsByLevel[data.level] || [];
                const parts = [];
                
                fieldsToShow.forEach(field => {
                    if (data[field]) {
                        // Format the field value
                        let value;
                        if (field === 'bureau') {
                            const fullName = data.bureau_full || data.bureau;
                            const abbreviation = data.abbreviation;
                            // Use abbreviation if full name is too long
                            const estimatedWidth = fullName.length * 8;
                            value = (estimatedWidth < width * 0.9 || !abbreviation) ? fullName : abbreviation;
                        } else if (field === 'fiscal_year') {
                            value = `FY ${data.fiscal_year}`;
                        } else if (field === 'account') {
                            value = data.account;
                        } else if (field === 'tas') {
                            value = data.tas;
                        } else {
                            value = data[field];
                        }
                        
                        parts.push(value);
                    }
                });
                
                label = parts.join('<br/>');
                
                // If no parts, use the node name
                if (parts.length === 0) {
                    label = data.name;
                }
            } else {
                // Fallback
                label = data.name;
            }
            
            return `<div>${label}</div>` +
                   (height > 40 ? `<div class="node-value">$${formatAmount(d.value)}</div>` : '');
        });
}

function getNodeColor(node) {
    // Color by bureau
    const bureau = node.data.bureau || node.parent?.data.bureau || node.data.name;
    return bureauColors(bureau);
}

function handleNodeClick(node) {
    if (node.parent && node.parent.data.name !== currentData.name) {
        // Build path to clicked node's parent
        const path = [];
        let current = node.parent;
        while (current && current.data.name !== currentData.name) {
            path.unshift(current.data.name);
            current = current.parent;
        }
        
        // Navigate to the clicked node's parent
        breadcrumbPath = [...breadcrumbPath, ...path];
        updateBreadcrumb();
        updateVisualization();
    }
}

function showTooltip(event, d) {
    const tooltip = d3.select('#tooltip');
    const data = d.data;
    const config = VIEW_CONFIGS[currentView];
    
    let content = `<strong>${data.name}</strong><br>`;
    content += `Amount: $${formatAmount(d.value)}<br>`;
    
    // Add fields based on configuration
    if (config && config.tooltipFields) {
        config.tooltipFields.forEach(field => {
            if (data[field]) {
                let label, value;
                switch(field) {
                    case 'bureau':
                        label = 'Component';
                        value = data.bureau_full || data.bureau;
                        break;
                    case 'account':
                        label = 'Account';
                        value = data.account;
                        break;
                    case 'tas':
                        label = 'TAS';
                        value = data.tas;
                        break;
                    case 'fiscal_year':
                        label = 'Fiscal Year';
                        value = data.fiscal_year;
                        break;
                    case 'availability_period':
                        label = 'Availability';
                        value = data.availability_period;
                        break;
                    case 'availability_type':
                        label = 'Availability Type';
                        value = data.availability_type;
                        break;
                    default:
                        label = field;
                        value = data[field];
                }
                content += `${label}: ${value}<br>`;
            }
        });
    }
    
    tooltip.html(content)
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 10) + 'px')
        .style('opacity', 1);
}

function hideTooltip() {
    d3.select('#tooltip').style('opacity', 0);
}

function updateBreadcrumb() {
    const breadcrumb = d3.select('#breadcrumb');
    breadcrumb.html('');
    
    // Only show breadcrumb if we've drilled down
    if (breadcrumbPath.length === 0) {
        breadcrumb.style('display', 'none');
        return;
    }
    
    breadcrumb.style('display', 'block');
    
    // Home link
    breadcrumb.append('span')
        .text('← Back to top')
        .style('cursor', 'pointer')
        .style('text-decoration', 'underline')
        .style('color', '#007bff')
        .on('click', navigateToRoot);
    
    // Current path
    breadcrumb.append('span')
        .text(' | Currently viewing: ')
        .style('color', '#666');
    
    // Path elements
    breadcrumbPath.forEach((step, i) => {
        if (i > 0) breadcrumb.append('span').text(' > ');
        breadcrumb.append('span')
            .text(step)
            .style('cursor', 'pointer')
            .style('text-decoration', 'underline')
            .on('click', () => {
                breadcrumbPath = breadcrumbPath.slice(0, i + 1);
                updateBreadcrumb();
                updateVisualization();
            });
    });
}

function updateInfo(hierarchyData) {
    const total = hierarchyData.value;
    const count = hierarchyData.leaves().length;
    
    d3.select('#totalAmount').text('$' + formatAmount(total));
    d3.select('#itemCount').text(count);
    
    let selection = breadcrumbPath.length > 0 ? breadcrumbPath.join(' > ') : 'All Components';
    
    const yearFilter = d3.select('#yearFilter').property('value');
    if (yearFilter !== 'all') {
        selection += ` (FY ${yearFilter})`;
    }
    
    d3.select('#selectionInfo').text(selection);
}

function formatAmount(amount) {
    if (amount >= 1e9) {
        return (amount / 1e9).toFixed(1) + 'B';
    } else if (amount >= 1e6) {
        return (amount / 1e6).toFixed(1) + 'M';
    } else if (amount >= 1e3) {
        return (amount / 1e3).toFixed(1) + 'K';
    }
    return amount.toFixed(0);
}