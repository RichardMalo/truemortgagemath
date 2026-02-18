/**
 * Advanced Mortgage Calculator (World-Class Edition)
 * Mobile-Optimized: Disabled modebars globally, tightened margins, fluid scaling.
 */

// === CONFIGURATION ===
const CONFIG = {
    colors: {
        principal: '#2563eb', // Blue
        interest: '#ef4444',  // Red
        tax: '#f59e0b',       // Amber
        ins: '#8b5cf6',       // Purple
        hoa: '#14b8a6',       // Teal
        pmi: '#ec4899',       // Pink
        extra: '#10b981',     // Green
        balance: '#64748b',   // Slate
        thresholdRed: '#ef4444',
        investLine: '#8b5cf6' // Purple for investment graph
    }
};

// Global Plotly config to enforce crispness (prevents the menu bar from rendering)
const PLOT_CONFIG = { responsive: true, displayModeBar: false };

// === DOM ELEMENTS ===
const els = {
    form: document.getElementById('mortgageForm'),
    inputs: {
        homePrice: document.getElementById('homePrice'),
        downPayment: document.getElementById('downPayment'),
        rate: document.getElementById('interestRate'),
        amortization: document.getElementById('amortization'),
        term: document.getElementById('term'),
        compounding: document.getElementById('compounding'),
        frequency: document.getElementById('paymentFrequency'),
        
        // PITI Toggle & Section
        pitiToggle: document.getElementById('includePitiToggle'),
        tax: document.getElementById('propertyTax'),
        ins: document.getElementById('homeInsurance'),
        hoa: document.getElementById('hoaFees'),
        pmi: document.getElementById('pmiRate'),
        
        // Opp Cost Toggle & Section
        oppCostToggle: document.getElementById('oppCostToggle'),
        investRate: document.getElementById('investRate'),

        extra: document.getElementById('extraPayment'),
        date: document.getElementById('firstPaymentDate')
    },
    results: {
        mortgageDisplay: document.getElementById('mortgageAmountDisplay'),
        monthly: document.getElementById('monthlyPaymentCircle'), 
        breakdown: document.getElementById('paymentBreakdownCircle'),
        termBalance: document.getElementById('balanceAtTerm'),
        paidOffIn: document.getElementById('paidOffIn'),
        saved: document.getElementById('extraSavedTotal'),
        truePaymentLabel: document.getElementById('truePaymentLabel')
    },
    containers: {
        pitiSection: document.getElementById('pitiSection'),
        oppCostSection: document.getElementById('oppCostSection'),
        comparison: document.getElementById('comparison-section'),
        error: document.getElementById('error-message'),
        escrowTh: document.getElementById('escrowTh'),
        ltvContainer: document.getElementById('ltv-chart-container'),
        oppCostContainer: document.getElementById('opp-cost-chart-container')
    },
    modeSwitch: document.getElementById('mode-switch')
};

// === STATE ===
let state = { isDark: true };

// === CORE MATH ===
const getMonthlyPayment = (p, monthlyRate, n) => {
    if (monthlyRate === 0) return p / n;
    return p * (monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1);
};

const generateSchedule = (inputs, isBaseline = false) => {
    const principal = inputs.homePrice - inputs.downPayment;
    
    let standardMonthlyRate = (inputs.compounding === 'semi') 
        ? Math.pow(1 + (inputs.annualRate / 100 / 2), 1 / 6) - 1 
        : (inputs.annualRate / 100 / 12);
        
    const maxMonths = inputs.amortizationYears * 12;
    const baseMonthlyPI = getMonthlyPayment(principal, standardMonthlyRate, maxMonths);

    const freq = isBaseline ? 'monthly' : inputs.frequency;
    const userExtra = isBaseline ? 0 : inputs.extraPayment;

    let periodsPerYear, periodicPI;
    switch(freq) {
        case 'monthly': periodsPerYear = 12; periodicPI = baseMonthlyPI; break;
        case 'semi-monthly': periodsPerYear = 24; periodicPI = baseMonthlyPI / 2; break;
        case 'bi-weekly': periodsPerYear = 26; periodicPI = (baseMonthlyPI * 12) / 26; break;
        case 'accelerated-biweekly': periodsPerYear = 26; periodicPI = baseMonthlyPI / 2; break;
    }

    let periodicRate = (inputs.compounding === 'semi')
        ? Math.pow(1 + (inputs.annualRate / 100 / 2), 2 / periodsPerYear) - 1
        : (inputs.annualRate / 100 / periodsPerYear);

    const periodicTax = (inputs.homePrice * (inputs.taxRate / 100)) / periodsPerYear;
    const periodicIns = inputs.insRate / periodsPerYear;
    const periodicHOA = (inputs.hoaRate * 12) / periodsPerYear;
    const pmiDropBalance = inputs.homePrice * 0.80; 

    let balance = principal;
    let totalInterest = 0, totalPrincipal = 0, totalExtra = 0, totalEscrow = 0;
    let schedule = [];
    
    let currentDate = inputs.startDate ? new Date(inputs.startDate) : null;
    const maxPeriods = Math.ceil(inputs.amortizationYears * periodsPerYear) + (periodsPerYear * 5); 

    for (let period = 1; period <= maxPeriods; period++) {
        if (balance <= 0.009) break;

        let periodicPMI = 0;
        if (balance > pmiDropBalance && inputs.pmiRate > 0) {
            periodicPMI = (principal * (inputs.pmiRate / 100)) / periodsPerYear;
        }

        const escrowTotal = periodicTax + periodicIns + periodicHOA + periodicPMI;
        const interestPart = balance * periodicRate;
        let principalPart = periodicPI - interestPart;
        let currentExtra = userExtra;

        if (principalPart + currentExtra > balance) {
            const totalRem = balance;
            principalPart = totalRem - currentExtra; 
            if (principalPart < 0) { currentExtra = totalRem; principalPart = 0; }
        }

        balance -= (principalPart + currentExtra);
        if (balance < 0.01) balance = 0;

        totalInterest += interestPart;
        totalPrincipal += principalPart;
        totalExtra += currentExtra;
        totalEscrow += escrowTotal;

        const currentLTV = (balance / inputs.homePrice) * 100;

        let dateLabel = `P${period}`;
        let yearLabel = (period / periodsPerYear);
        
        if (currentDate) {
            const d = new Date(currentDate.getTime() + Math.abs(currentDate.getTimezoneOffset() * 60000));
            if (freq === 'monthly') d.setMonth(d.getMonth() + (period - 1));
            else if (freq === 'semi-monthly') d.setDate(d.getDate() + ((period - 1) * 15)); 
            else d.setDate(d.getDate() + ((period - 1) * 14)); 
            
            dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            yearLabel = d.getFullYear() + (d.getMonth() / 12) + (d.getDate() / 365);
        }

        schedule.push({
            period, year: yearLabel, dateLabel, ltv: currentLTV,
            payment: principalPart + interestPart + escrowTotal + currentExtra,
            principal: principalPart, interest: interestPart, escrow: escrowTotal,
            tax: periodicTax, ins: periodicIns, hoa: periodicHOA, pmi: periodicPMI,
            extra: currentExtra, balance: balance,
            totalInterest, totalPrincipal, totalExtra, totalEscrow
        });
    }

    return { schedule, summary: { periodsToPayoff: schedule.length, periodsPerYear, totalInterest, totalPrincipal, totalEscrow } };
};

const formatCurrency = (num) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);

// === LAYOUT ENGINE ===
const getBaseLayout = (title, xTitle, yTitle) => {
    const color = state.isDark ? '#e2e8f0' : '#2c3e50';
    const grid = state.isDark ? '#334155' : '#e2e8f0';
    return {
        // Pinned title up high
        title: { text: title, font: { color: color, size: 16 }, y: 0.98 },
        paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
        font: { color: color, family: 'Inter, sans-serif' },
        xaxis: { title: xTitle, gridcolor: grid, showgrid: true, zeroline: false },
        yaxis: { title: yTitle, gridcolor: grid, showgrid: true, zeroline: false },
        // IMPORTANT FIX: Increased Top Margin (t: 65) to give title breathing room away from hover labels
        margin: { t: 65, r: 10, l: 50, b: 40 }, 
        legend: { orientation: 'h', y: -0.2 },
        autosize: true
    };
};

const renderCharts = (baseData, actualData, inputs, hasExtraOrStrategy) => {
    const useDates = !!inputs.startDate;
    const xKey = 'year'; 

    let termX = inputs.termYears;
    if (useDates && baseData.schedule.length > 0) termX = baseData.schedule[0].year + inputs.termYears;

    const termLine = {
        type: 'line', x0: termX, y0: 0, x1: termX, y1: 1, 
        xref: 'x', yref: 'paper',
        line: { color: CONFIG.colors.interest, width: 2, dash: 'dot' }
    };

    // --- Core Charts ---
    const p1 = actualData.schedule[0] || { principal:0, interest:0, tax:0, ins:0, hoa:0, pmi:0, extra:0 };
    const totalPITI = p1.principal + p1.interest + p1.tax + p1.ins + p1.hoa + p1.pmi + p1.extra;
    
    // Determine font size dynamically based on screen size for the inner text
    const innerFontSize = window.innerWidth < 768 ? '18px' : '22px';

    Plotly.newPlot('monthlyPaymentCircle', [{
        values: [p1.principal, p1.interest, p1.tax, p1.ins, p1.hoa, p1.pmi, p1.extra].filter(v => v > 0),
        labels: ['Principal', 'Interest', 'Taxes', 'Insurance', 'HOA', 'PMI', 'Extra'].filter((_, i) => [p1.principal, p1.interest, p1.tax, p1.ins, p1.hoa, p1.pmi, p1.extra][i] > 0),
        type: 'pie', hole: 0.75,
        marker: { colors: [CONFIG.colors.principal, CONFIG.colors.interest, CONFIG.colors.tax, CONFIG.colors.ins, CONFIG.colors.hoa, CONFIG.colors.pmi, CONFIG.colors.extra] },
        textinfo: 'none', hovertemplate: '<b>%{label}</b><br>$%{value:,.2f}<extra></extra>'
    }], {
        showlegend: false, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)', margin: {t:0, b:0, l:0, r:0},
        annotations: [{ text: `<b>Total/Period</b><br><span style="font-size: ${innerFontSize}; color: ${state.isDark?'#fff':'#000'}">${formatCurrency(totalPITI)}</span>`, showarrow: false, font: { size: 12, color: state.isDark?'#94a3b8':'#64748b' } }]
    }, PLOT_CONFIG);

    Plotly.newPlot('paymentBreakdownCircle', [{
        values: [p1.principal, p1.interest], labels: ['Principal', 'Interest'], type: 'pie', hole: 0.6,
        marker: { colors: [CONFIG.colors.principal, CONFIG.colors.interest] }, textinfo: 'none'
    }], { showlegend: false, paper_bgcolor: 'rgba(0,0,0,0)', margin: {t:0, b:0, l:0, r:0}, annotations: [{text: 'P & I Only', showarrow: false, font: { size: 14, color: state.isDark?'#fff':'#000' }}] }, PLOT_CONFIG);

    const tracesChart3 = [{
        x: baseData.schedule.map(d => d[xKey]), y: baseData.schedule.map(d => d.balance),
        name: 'Balance (Std Monthly)', type: 'scatter', fill: 'tozeroy', line: { color: CONFIG.colors.principal }
    }];
    if (hasExtraOrStrategy) tracesChart3.push({ x: actualData.schedule.map(d => d[xKey]), y: actualData.schedule.map(d => d.balance), name: 'Balance (Actual)', type: 'scatter', line: { color: CONFIG.colors.extra, width: 3 } });
    const layout3 = getBaseLayout('Mortgage Balance Over Time', 'Year', 'Balance ($)');
    layout3.shapes = [termLine]; layout3.annotations = [{ x: termX, y: 1, xref: 'x', yref: 'paper', text: 'Term End', showarrow: false, yanchor: 'bottom', font: { color: CONFIG.colors.interest } }];
    Plotly.newPlot('chart3', tracesChart3, layout3, PLOT_CONFIG);

    const principalAmount = actualData.schedule.length ? (actualData.schedule[0].balance + actualData.schedule[0].principal) : 0;
    const tracesEquity = [{ x: baseData.schedule.map(d => d[xKey]), y: baseData.schedule.map(d => principalAmount - d.balance), name: 'Equity (Std Monthly)', type: 'scatter', line: { color: CONFIG.colors.principal } }];
    if (hasExtraOrStrategy) tracesEquity.push({ x: actualData.schedule.map(d => d[xKey]), y: actualData.schedule.map(d => principalAmount - d.balance), name: 'Equity (Actual)', type: 'scatter', line: { color: CONFIG.colors.extra } });
    Plotly.newPlot('chart4', tracesEquity, getBaseLayout('Equity Build-Up', 'Year', 'Equity ($)'), PLOT_CONFIG);

    const tracesChart2 = [
        {x: actualData.schedule.map(d => d[xKey]), y: actualData.schedule.map(d => d.totalInterest), name: 'Interest', stackgroup: 'one', line: { color: CONFIG.colors.interest }},
        {x: actualData.schedule.map(d => d[xKey]), y: actualData.schedule.map(d => d.totalPrincipal), name: 'Principal', stackgroup: 'one', line: { color: CONFIG.colors.principal }}
    ];
    if (inputs.usePiti) tracesChart2.push({x: actualData.schedule.map(d => d[xKey]), y: actualData.schedule.map(d => d.totalEscrow), name: 'Escrow', stackgroup: 'one', line: { color: CONFIG.colors.tax }});
    Plotly.newPlot('chart2', tracesChart2, getBaseLayout('Cumulative Outflow', 'Year', 'Total Paid ($)'), PLOT_CONFIG);

    const annualData = {};
    actualData.schedule.forEach(d => {
        const y = Math.floor(d[xKey]);
        if (!annualData[y]) annualData[y] = { p: 0, i: 0, e: 0, esc: 0 };
        annualData[y].p += d.principal; annualData[y].i += d.interest; annualData[y].e += d.extra; annualData[y].esc += d.escrow;
    });
    const years = Object.keys(annualData);
    const tracesChart11 = [
        { x: years, y: years.map(y=>annualData[y].i), name: 'Interest', type: 'bar', marker: {color: CONFIG.colors.interest} },
        { x: years, y: years.map(y=>annualData[y].p), name: 'Principal', type: 'bar', marker: {color: CONFIG.colors.principal} },
        { x: years, y: years.map(y=>annualData[y].e), name: 'Extra', type: 'bar', marker: {color: CONFIG.colors.extra} }
    ];
    if (inputs.usePiti) tracesChart11.splice(1, 0, { x: years, y: years.map(y=>annualData[y].esc), name: 'Escrow', type: 'bar', marker: {color: CONFIG.colors.tax} });
    Plotly.newPlot('chart11', tracesChart11, Object.assign(getBaseLayout('Annual Cash Flow Split', 'Year', 'Amount ($)'), {barmode: 'stack'}), PLOT_CONFIG);

    Plotly.newPlot('chart6', [
        { x: actualData.schedule.map(d=>d[xKey]), y: actualData.schedule.map(d=>d.interest), name: 'Interest Portion', type: 'scatter', fill: 'tozeroy', line: {color: CONFIG.colors.interest} },
        { x: actualData.schedule.map(d=>d[xKey]), y: actualData.schedule.map(d=>d.principal), name: 'Principal Portion', type: 'scatter', fill: 'tonexty', line: {color: CONFIG.colors.principal} }
    ], getBaseLayout('Periodic Payment Comp.', 'Year', 'Amount ($)'), PLOT_CONFIG);

    const finalData = actualData.schedule[actualData.schedule.length-1] || {totalInterest:0, totalEscrow:0, totalPrincipal:0, totalExtra:0};
    const tracesTotal = [
        { x: ['Total Cost'], y: [finalData.totalInterest], name: 'Interest', type: 'bar', marker: {color: CONFIG.colors.interest} },
        { x: ['Total Cost'], y: [finalData.totalPrincipal], name: 'Principal', type: 'bar', marker: {color: CONFIG.colors.principal} },
        { x: ['Total Cost'], y: [finalData.totalExtra], name: 'Extra Payments', type: 'bar', marker: {color: CONFIG.colors.extra} }
    ];
    if (inputs.usePiti) tracesTotal.splice(1, 0, { x: ['Total Cost'], y: [finalData.totalEscrow], name: 'Escrow', type: 'bar', marker: {color: CONFIG.colors.tax} });
    Plotly.newPlot('chart', tracesTotal, Object.assign(getBaseLayout('Lifetime Cost Breakdown', '', 'Amount ($)'), {barmode: 'stack'}), PLOT_CONFIG);

    // --- LTV Chart ---
    if (inputs.usePiti) {
        els.containers.ltvContainer.style.display = 'flex';
        const traceLTVBase = { x: baseData.schedule.map(d => d[xKey]), y: baseData.schedule.map(d => d.ltv), name: 'LTV (Std)', type: 'scatter', line: { color: CONFIG.colors.principal } };
        const tracesLTV = [traceLTVBase];
        if (hasExtraOrStrategy) tracesLTV.push({ x: actualData.schedule.map(d => d[xKey]), y: actualData.schedule.map(d => d.ltv), name: 'LTV (Actual)', type: 'scatter', line: { color: CONFIG.colors.extra, width: 3 } });

        const layoutLTV = getBaseLayout('LTV & PMI Drop', 'Year', 'LTV (%)');
        layoutLTV.yaxis.range = [0, Math.max(105, actualData.schedule[0]?.ltv || 100)];
        layoutLTV.shapes = [ termLine, { type: 'line', x0: 0, y0: 80, x1: 1, y1: 80, xref: 'paper', yref: 'y', line: { color: CONFIG.colors.thresholdRed, width: 2, dash: 'dash' } } ];
        layoutLTV.annotations = [
            { x: termX, y: 1, xref: 'x', yref: 'paper', text: 'Term End', showarrow: false, yanchor: 'bottom', font: { color: CONFIG.colors.interest } },
            { x: 1, y: 80, xref: 'paper', yref: 'y', text: '80% LTV (PMI Drops)', showarrow: false, xanchor: 'right', yanchor: 'bottom', font: { color: CONFIG.colors.thresholdRed, size: 12 } }
        ];
        Plotly.newPlot('chartLTV', tracesLTV, layoutLTV, PLOT_CONFIG);
    } else {
        els.containers.ltvContainer.style.display = 'none';
        Plotly.purge('chartLTV'); 
    }

    // --- OPPORTUNITY COST ANALYZER ---
    if (inputs.useOppCost && hasExtraOrStrategy) {
        els.containers.oppCostContainer.style.display = 'flex';
        const investRateAnnual = inputs.investRate / 100;
        const hp = inputs.homePrice;
        
        const path1X = [], path1Y = [];
        let p1InvestBalance = 0;
        const p1PIExtra = actualData.schedule[0].principal + actualData.schedule[0].interest + actualData.schedule[0].extra;
        const p1PeriodsPerYear = actualData.summary.periodsPerYear;
        const p1RatePerPeriod = Math.pow(1 + investRateAnnual, 1/p1PeriodsPerYear) - 1;
        
        actualData.schedule.forEach(d => { path1X.push(d.year); path1Y.push(hp - d.balance); });
        
        let currentYear = path1X[path1X.length - 1];
        const maxYear = baseData.schedule[baseData.schedule.length - 1].year;
        
        while (currentYear < maxYear) {
            currentYear += (1 / p1PeriodsPerYear);
            p1InvestBalance = (p1InvestBalance + p1PIExtra) * (1 + p1RatePerPeriod);
            path1X.push(currentYear); path1Y.push(hp + p1InvestBalance);
        }
        
        const path2X = [], path2Y = [];
        let p2InvestBalance = 0;
        const p2PI = baseData.schedule[0].principal + baseData.schedule[0].interest;
        const p2PeriodsPerYear = baseData.summary.periodsPerYear;
        const p2RatePerPeriod = Math.pow(1 + investRateAnnual, 1/p2PeriodsPerYear) - 1;
        
        const annualBudget = p1PIExtra * p1PeriodsPerYear;
        const annualBase = p2PI * p2PeriodsPerYear;
        const p2InvestPerPeriod = Math.max(0, annualBudget - annualBase) / p2PeriodsPerYear;
        
        baseData.schedule.forEach(d => {
            p2InvestBalance = (p2InvestBalance + p2InvestPerPeriod) * (1 + p2RatePerPeriod);
            path2X.push(d.year); path2Y.push(hp - d.balance + p2InvestBalance);
        });
        
        const layoutOppCost = getBaseLayout('Projection: Pay Debt vs Invest', 'Year', 'Net Worth ($)');
        layoutOppCost.legend = { orientation: 'h', y: -0.2 };
        
        Plotly.newPlot('chartOppCost', [
            { x: path1X, y: path1Y, name: 'Pay Off Debt Faster', type: 'scatter', line: { color: CONFIG.colors.extra, width: 3 } },
            { x: path2X, y: path2Y, name: 'Invest Extra Cashflow', type: 'scatter', line: { color: CONFIG.colors.investLine, width: 3, dash: 'dot' } }
        ], layoutOppCost, PLOT_CONFIG);
        
    } else {
        els.containers.oppCostContainer.style.display = 'none';
        Plotly.purge('chartOppCost');
    }

    // --- COMPARISON CHARTS ---
    if (hasExtraOrStrategy) {
        const totalCostBase = baseData.summary.totalInterest + baseData.summary.totalEscrow;
        const totalCostExtra = actualData.summary.totalInterest + actualData.summary.totalEscrow;
        
        Plotly.newPlot('chart9', [{
            x: ['Std Monthly', 'Actual'], y: [totalCostBase, totalCostExtra], type: 'bar',
            text: [formatCurrency(totalCostBase), formatCurrency(totalCostExtra)], textposition: 'auto',
            marker: { color: [CONFIG.colors.interest, CONFIG.colors.extra] }
        }], getBaseLayout('Total Cost Comparison', '', '$'), PLOT_CONFIG);

        const yearsBase = (baseData.summary.periodsToPayoff / 12).toFixed(1);
        const yearsExtra = (actualData.summary.periodsToPayoff / actualData.summary.periodsPerYear).toFixed(1);
        Plotly.newPlot('chart12', [{
            x: ['Std Monthly', 'Actual'], y: [yearsBase, yearsExtra], type: 'bar',
            text: [yearsBase + ' Years', yearsExtra + ' Years'], textposition: 'auto',
            marker: { color: [CONFIG.colors.principal, CONFIG.colors.extra] }
        }], getBaseLayout('Time to Pay Off', '', 'Years'), PLOT_CONFIG);
    }
};

const updateTable = (schedule, usePiti) => {
    const tbody = document.querySelector('#amortization-table tbody');
    els.containers.escrowTh.style.display = usePiti ? '' : 'none';
    
    tbody.innerHTML = '';
    const frag = document.createDocumentFragment();
    schedule.forEach(row => {
        const tr = document.createElement('tr');
        const escrowTd = usePiti ? `<td style="color: #8b5cf6">${formatCurrency(row.escrow)}</td>` : '';
        tr.innerHTML = `<td>${row.dateLabel}</td><td><strong>${formatCurrency(row.payment)}</strong></td><td>${formatCurrency(row.principal)}</td><td>${formatCurrency(row.interest)}</td>${escrowTd}<td>${formatCurrency(row.extra)}</td><td><strong>${formatCurrency(row.balance)}</strong></td>`;
        frag.appendChild(tr);
    });
    tbody.appendChild(frag);
};

const validateInputs = () => {
    els.containers.error.style.display = 'none';
    if (parseFloat(els.inputs.homePrice.value) <= 0) {
        els.containers.error.textContent = "Home Price must be a positive number.";
        els.containers.error.style.display = 'block';
        return false;
    }
    return true;
};

// === MAIN CONTROLLER ===
const calculate = (e) => {
    if (e) e.preventDefault();
    if (!validateInputs()) return;

    const usePiti = els.inputs.pitiToggle.checked;
    const useOppCost = els.inputs.oppCostToggle.checked;

    const inputs = {
        homePrice: parseFloat(els.inputs.homePrice.value) || 0,
        downPayment: parseFloat(els.inputs.downPayment.value) || 0,
        annualRate: parseFloat(els.inputs.rate.value) || 0,
        amortizationYears: parseFloat(els.inputs.amortization.value) || 0,
        termYears: parseFloat(els.inputs.term.value) || 0,
        compounding: els.inputs.compounding.value,
        frequency: els.inputs.frequency.value,
        
        usePiti: usePiti,
        taxRate: usePiti ? (parseFloat(els.inputs.tax.value) || 0) : 0,
        insRate: usePiti ? (parseFloat(els.inputs.ins.value) || 0) : 0,
        hoaRate: usePiti ? (parseFloat(els.inputs.hoa.value) || 0) : 0,
        pmiRate: usePiti ? (parseFloat(els.inputs.pmi.value) || 0) : 0,
        
        useOppCost: useOppCost,
        investRate: useOppCost ? (parseFloat(els.inputs.investRate.value) || 7.0) : 7.0,

        extraPayment: parseFloat(els.inputs.extra.value) || 0,
        startDate: els.inputs.date.value
    };

    const principal = inputs.homePrice - inputs.downPayment;
    els.results.mortgageDisplay.value = formatCurrency(principal);
    els.results.truePaymentLabel.textContent = usePiti ? "True Periodic Payment (PITI)" : "Periodic Payment (P & I)";

    const baseData = generateSchedule(inputs, true); 
    const actualData = generateSchedule(inputs, false); 

    const years = Math.floor(actualData.summary.periodsToPayoff / actualData.summary.periodsPerYear);
    const remainingPeriods = actualData.summary.periodsToPayoff % actualData.summary.periodsPerYear;
    let periodLabel = inputs.frequency.includes('bi') ? "periods" : "months";
    els.results.paidOffIn.value = `${years} yrs, ${remainingPeriods} ${periodLabel}`;

    const termPeriods = Math.ceil(inputs.termYears * actualData.summary.periodsPerYear);
    els.results.termBalance.value = formatCurrency(termPeriods < actualData.schedule.length ? actualData.schedule[Math.max(0, termPeriods - 1)].balance : 0);

    const baseCost = baseData.summary.totalInterest + baseData.summary.totalEscrow;
    const actualCost = actualData.summary.totalInterest + actualData.summary.totalEscrow;
    els.results.saved.value = formatCurrency(baseCost - actualCost);

    const hasStrategy = inputs.extraPayment > 0 || inputs.frequency !== 'monthly';
    els.containers.comparison.style.display = hasStrategy ? 'block' : 'none';

    renderCharts(baseData, actualData, inputs, hasStrategy);
    updateTable(actualData.schedule, usePiti);
};

// === INIT ===
const setNextMonthStart = () => {
    if (!els.inputs.date.value) {
        const today = new Date();
        const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
        const yyyy = nextMonth.getFullYear();
        const mm = String(nextMonth.getMonth() + 1).padStart(2, '0');
        const dd = String(nextMonth.getDate()).padStart(2, '0');
        els.inputs.date.value = `${yyyy}-${mm}-${dd}`;
    }
};

// Event Listeners
els.modeSwitch.addEventListener('change', (e) => {
    state.isDark = e.target.checked;
    document.body.classList.toggle('dark-mode', state.isDark);
    calculate(); 
});

els.inputs.pitiToggle.addEventListener('change', (e) => {
    els.containers.pitiSection.style.display = e.target.checked ? 'block' : 'none';
    calculate();
});

els.inputs.oppCostToggle.addEventListener('change', (e) => {
    els.containers.oppCostSection.style.display = e.target.checked ? 'block' : 'none';
    calculate();
});

document.getElementById('clearBtn').addEventListener('click', () => {
    els.form.reset();
    setNextMonthStart(); 
    els.containers.pitiSection.style.display = els.inputs.pitiToggle.checked ? 'block' : 'none';
    els.containers.oppCostSection.style.display = els.inputs.oppCostToggle.checked ? 'block' : 'none';
    calculate();
});
document.getElementById('printChartsBtn').addEventListener('click', () => window.print());

// Auto-resize charts if phone orientation changes
window.addEventListener('resize', () => calculate());

document.addEventListener('DOMContentLoaded', () => {
    setNextMonthStart();
    document.body.classList.toggle('dark-mode', state.isDark);
    els.containers.pitiSection.style.display = els.inputs.pitiToggle.checked ? 'block' : 'none';
    els.containers.oppCostSection.style.display = els.inputs.oppCostToggle.checked ? 'block' : 'none';
    calculate();
});

els.form.addEventListener('submit', calculate);
Object.values(els.inputs).forEach(input => {
    if(input && input.id !== 'includePitiToggle' && input.id !== 'oppCostToggle') {
        input.addEventListener('blur', () => calculate());
        if(input.tagName === 'SELECT') input.addEventListener('change', () => calculate());
    }
});
