// Global variables
let data = [];
let currentView = 'bureau';
let currentData = null;
let currentLevel = 'root';
let breadcrumbPath = [];

// Bureau abbreviations for small rectangles
const bureauAbbreviations = {
    'Analysis and Operations': 'A&O',
    'Citizenship and Immigration Services': 'USCIS',
    'Countering Weapons of Mass Destruction Office': 'CWMD',
    'Cybersecurity and Infrastructure Security Agency': 'CISA',
    'Federal Emergency Management Agency': 'FEMA',
    'Federal Law Enforcement Training Center': 'FLETC',
    'Federal Law Enforcement Training Centers': 'FLETC',
    'Management Directorate': 'MGMT',
    'Office of the Inspector General': 'OIG',
    'Office of the Secretary and Executive Management': 'OSEM',
    'Science and Technology': 'S&T',
    'Transportation Security Administration': 'TSA',
    'U.S. Customs and Border Protection': 'CBP',
    'U.S. Immigration and Customs Enforcement': 'ICE',
    'United States Coast Guard': 'USCG',
    'United States Secret Service': 'USSS'
};

// Color scales
// Tableau 20 color scheme for better distinction with 16 bureaus
const tableau20 = [
    '#1f77b4', '#aec7e8', '#ff7f0e', '#ffbb78', '#2ca02c',
    '#98df8a', '#d62728', '#ff9896', '#9467bd', '#c5b0d5',
    '#8c564b', '#c49c94', '#e377c2', '#f7b6d2', '#7f7f7f',
    '#c7c7c7', '#bcbd22', '#dbdb8d', '#17becf', '#9edae5'
];
const bureauColors = d3.scaleOrdinal(tableau20);
const availabilityColors = {
    'X': '#2ca02c',
    'multi-year': '#1f77b4',
    'annual': '#ff7f0e'
};

// Load and process data
d3.csv('data/dhs_tas_aggregated.csv').then(rawData => {
    data = rawData.map(d => ({
        ...d,
        amount: +d.amount,
        amount_millions: +d.amount_millions,
        fiscal_year: d.fiscal_year,
        availability_type: d.availability_period === 'X' ? 'no-year' : 
                         (d.availability_period.includes('/') ? 'multi-year' : 'annual')
    }));
    
    // Check for update metadata
    d3.json('data/update_metadata.json').then(metadata => {
        if (metadata && metadata.last_updated) {
            const updateDate = new Date(metadata.last_updated);
            const formattedDate = updateDate.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            
            // Add last updated info to the page
            const infoDiv = d3.select('#info');
            infoDiv.append('div')
                .attr('class', 'stat')
                .html(`<span class="stat-label">Data Last Pulled from OpenOMB:</span> <span class="stat-value">${formattedDate}</span>`);
        }
    }).catch(err => {
        console.log('No update metadata found');
    });
    
    // Initialize
    updateVisualization();
    
    // Remove loading message
    d3.select('#treemap').select('.loading').remove();
});

// Event handlers
d3.select('#yearFilter').on('change', updateVisualization);
d3.select('#availabilityFilter').on('change', updateVisualization);
d3.select('#aggregateBy').on('change', updateVisualization);
d3.select('#viewBureau').on('click', () => switchView('bureau'));
d3.select('#viewTAS').on('click', () => switchView('tas'));
d3.select('#breadcrumbRoot').on('click', () => navigateToRoot());

function switchView(view) {
    currentView = view;
    d3.select('#viewBureau').classed('active', view === 'bureau');
    d3.select('#viewTAS').classed('active', view === 'tas');
    navigateToRoot();
}

function navigateToRoot() {
    currentLevel = 'root';
    breadcrumbPath = [];
    updateBreadcrumb();
    updateVisualization();
}

function updateVisualization() {
    // Filter data
    const yearFilter = d3.select('#yearFilter').property('value');
    const availFilter = d3.select('#availabilityFilter').property('value');
    
    let filteredData = data;
    
    if (yearFilter !== 'all') {
        filteredData = filteredData.filter(d => d.fiscal_year === yearFilter);
    }
    
    if (availFilter !== 'all') {
        filteredData = filteredData.filter(d => d.availability_type === availFilter);
    }
    
    // Create hierarchical data
    let hierarchy;
    if (currentView === 'bureau') {
        hierarchy = createBureauHierarchy(filteredData);
    } else {
        hierarchy = createTASHierarchy(filteredData);
    }
    
    // Navigate to current level
    let displayData = hierarchy;
    for (let step of breadcrumbPath) {
        displayData = displayData.children.find(d => d.data.name === step);
        if (!displayData) {
            navigateToRoot();
            return;
        }
    }
    
    currentData = displayData;
    
    // Update treemap
    drawTreemap(displayData);
    updateInfo(displayData, filteredData);
}

function createBureauHierarchy(data) {
    const aggregateMode = d3.select('#aggregateBy').property('value');
    
    const root = {
        name: 'DHS Total',
        children: []
    };
    
    if (aggregateMode === 'bureau-only') {
        // Just bureaus - no sub-grouping
        const bureauGroups = d3.group(data, d => d.bureau);
        
        for (let [bureau, records] of bureauGroups) {
            const bureauNode = {
                name: bureau,
                bureau: bureau,  // Ensure bureau is always set
                value: d3.sum(records, d => d.amount),
                records: records
            };
            root.children.push(bureauNode);
        }
    } else if (aggregateMode === 'by-year') {
        // Group by bureau, then fiscal year
        const bureauGroups = d3.group(data, d => d.bureau, d => d.fiscal_year);
        
        for (let [bureau, years] of bureauGroups) {
            const bureauNode = {
                name: bureau,
                children: []
            };
            
            for (let [year, records] of years) {
                const yearNode = {
                    name: `FY ${year}`,
                    bureau: bureau,
                    fiscal_year: year,
                    value: d3.sum(records, d => d.amount),
                    records: records
                };
                bureauNode.children.push(yearNode);
            }
            
            if (bureauNode.children.length > 0) {
                root.children.push(bureauNode);
            }
        }
    } else if (aggregateMode === 'no-tas') {
        // Group by bureau, then account (combine all TAS)
        const bureauGroups = d3.group(data, d => d.bureau, d => d.account);
        
        for (let [bureau, accounts] of bureauGroups) {
            const bureauNode = {
                name: bureau,
                children: []
            };
            
            for (let [account, records] of accounts) {
                const accountNode = {
                    name: account,
                    bureau: bureau,
                    value: d3.sum(records, d => d.amount),
                    records: records
                };
                bureauNode.children.push(accountNode);
            }
            
            if (bureauNode.children.length > 0) {
                root.children.push(bureauNode);
            }
        }
    } else {
        // Default: Group by bureau, then account, then TAS
        const bureauGroups = d3.group(data, d => d.bureau, d => d.account, d => d.tas_full);
        
        for (let [bureau, accounts] of bureauGroups) {
            const bureauNode = {
                name: bureau,
                children: []
            };
            
            for (let [account, tasGroups] of accounts) {
                const accountNode = {
                    name: account,
                    bureau: bureau,
                    children: []
                };
                
                for (let [tas, records] of tasGroups) {
                    const tasNode = {
                        name: tas,
                        bureau: bureau,
                        account: account,
                        value: d3.sum(records, d => d.amount),
                        records: records
                    };
                    accountNode.children.push(tasNode);
                }
                
                if (accountNode.children.length > 0) {
                    bureauNode.children.push(accountNode);
                }
            }
            
            if (bureauNode.children.length > 0) {
                root.children.push(bureauNode);
            }
        }
    }
    
    return d3.hierarchy(root)
        .sum(d => d.value || 0)
        .sort((a, b) => b.value - a.value);
}

function createTASHierarchy(data) {
    // Group by TAS, then bureau, then fiscal year
    const tasGroups = d3.group(data, d => d.tas, d => d.bureau, d => d.fiscal_year);
    
    const root = {
        name: 'DHS Total',
        children: []
    };
    
    for (let [tas, bureaus] of tasGroups) {
        const tasNode = {
            name: tas,
            children: []
        };
        
        for (let [bureau, years] of bureaus) {
            const bureauNode = {
                name: bureau,
                tas: tas,
                children: []
            };
            
            for (let [year, records] of years) {
                const yearNode = {
                    name: `FY ${year}`,
                    tas: tas,
                    bureau: bureau,
                    value: d3.sum(records, d => d.amount),
                    records: records
                };
                bureauNode.children.push(yearNode);
            }
            
            if (bureauNode.children.length > 0) {
                tasNode.children.push(bureauNode);
            }
        }
        
        if (tasNode.children.length > 0) {
            root.children.push(tasNode);
        }
    }
    
    return d3.hierarchy(root)
        .sum(d => d.value || 0)
        .sort((a, b) => b.value - a.value);
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
    
    // Create nodes
    const nodes = container.selectAll('.node')
        .data(hierarchyData.leaves())
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
            
            let label = d.data.name;
            
            // Check if this label is a bureau name and use abbreviation if needed
            if (bureauAbbreviations.hasOwnProperty(label) && width < 150) {
                label = bureauAbbreviations[label];
            } else if (width < 100) {
                // Truncate long labels
                label = label.substring(0, 15) + '...';
            }
            
            return `<div>${label}</div>` +
                   (height > 40 ? `<div class="node-value">$${formatAmount(d.value)}</div>` : '');
        });
}

function getNodeColor(node) {
    // First check if this node itself is a bureau (for bureau-only view)
    const aggregateMode = d3.select('#aggregateBy').property('value');
    if (aggregateMode === 'bureau-only' && node.depth === 1) {
        return bureauColors(node.data.name);
    }
    
    // Otherwise find the bureau from the node or its parents
    const bureau = node.data.bureau || node.parent?.data.bureau || node.parent?.data.name || node.data.name;
    return bureauColors(bureau);
}

function handleNodeClick(node) {
    if (node.parent && node.parent.data.name !== currentData.data.name) {
        // Drill down
        const path = [];
        let current = node.parent;
        while (current && current.data.name !== 'DHS Total') {
            path.unshift(current.data.name);
            current = current.parent;
        }
        breadcrumbPath = path;
        updateBreadcrumb();
        updateVisualization();
    }
}

function showTooltip(event, d) {
    const tooltip = d3.select('#tooltip');
    
    let content = `<strong>${d.data.name}</strong><br>`;
    content += `Amount: $${formatAmount(d.value)}<br>`;
    
    if (d.data.records && d.data.records.length > 0) {
        const record = d.data.records[0];
        content += `Bureau: ${record.bureau}<br>`;
        content += `Account: ${record.account}<br>`;
        content += `TAS: ${record.tas}<br>`;
        content += `Availability: ${record.availability_period}<br>`;
        if (d.data.records.length > 1) {
            content += `<em>${d.data.records.length} records</em>`;
        }
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
    
    // Root
    breadcrumb.append('span')
        .attr('id', 'breadcrumbRoot')
        .text('DHS Total')
        .on('click', () => navigateToRoot());
    
    // Path
    breadcrumbPath.forEach((step, i) => {
        breadcrumb.append('span').text(' > ');
        breadcrumb.append('span')
            .text(step)
            .on('click', () => {
                breadcrumbPath = breadcrumbPath.slice(0, i + 1);
                updateBreadcrumb();
                updateVisualization();
            });
    });
}

function updateInfo(hierarchyData, filteredData) {
    const total = hierarchyData.value;
    const count = hierarchyData.leaves().length;
    
    d3.select('#totalAmount').text('$' + formatAmount(total));
    d3.select('#itemCount').text(count);
    
    let selection = 'All DHS';
    if (breadcrumbPath.length > 0) {
        selection = breadcrumbPath.join(' > ');
    }
    
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