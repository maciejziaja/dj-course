document.addEventListener('DOMContentLoaded', () => {
    displayStats();
});

function displayStats() {
    document.title = 'Time Statistics - Developer Distractor Destroyer';

    const timeStatsList = document.getElementById('statsList');
    const timeChartCanvas = document.getElementById('timeChart').getContext('2d');
    const clearTimeStatsBtn = document.getElementById('clearTimeStats');
    let timeChart = null;

    const gotchaStatsList = document.getElementById('gotchaList');
    const gotchaChartCanvas = document.getElementById('gotchaChart').getContext('2d');
    const clearGotchaStatsBtn = document.getElementById('clearGotchaStats');
    let gotchaChart = null;

    let intervalId = null;
    let currentPeriod = 'week'; // Default: last week
    let customDateRange = { start: null, end: null };

    function formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    // Helper function to format date as YYYY-MM-DD (local timezone)
    function formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // Get date range for different periods
    function getDateRange(period) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        switch(period) {
            case 'week': {
                // Last 7 days
                const start = new Date(today);
                start.setDate(start.getDate() - 6); // Include today, so 6 days back
                return { start: formatDate(start), end: formatDate(today) };
            }
            case 'month': {
                // Last 30 days
                const start = new Date(today);
                start.setDate(start.getDate() - 29); // Include today, so 29 days back
                return { start: formatDate(start), end: formatDate(today) };
            }
            case 'all':
                return { start: null, end: null }; // No filtering
            case 'custom':
                return customDateRange;
            default:
                return { start: null, end: null };
        }
    }

    // Get week range (Monday to Sunday) for a given date
    function getWeekRange(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
        const monday = new Date(d.setDate(diff));
        const sunday = new Date(monday);
        sunday.setDate(sunday.getDate() + 6);
        return { start: formatDate(monday), end: formatDate(sunday) };
    }

    // Filter data by date range
    function filterDataByDateRange(data, startDate, endDate) {
        if (!startDate && !endDate) {
            return data; // No filtering
        }

        const filtered = {};
        for (const [domain, dates] of Object.entries(data)) {
            if (typeof dates !== 'object' || dates === null) {
                // Handle old data structure (number instead of object with dates)
                // Skip it as it's not in the new format - should be migrated
                continue;
            }

            const filteredDates = {};
            let total = 0;

            for (const [date, value] of Object.entries(dates)) {
                if (typeof value !== 'number') continue;

                // Validate date format (should be YYYY-MM-DD)
                if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                    console.warn(`Invalid date format for ${domain}: ${date}`);
                    continue;
                }

                // Check if date is in range (dates are in YYYY-MM-DD format, so string comparison works)
                if (startDate && date < startDate) continue;
                if (endDate && date > endDate) continue;

                filteredDates[date] = value;
                total += value;
            }

            if (total > 0) {
                filtered[domain] = filteredDates;
            }
        }

        return filtered;
    }

    // Aggregate data by weeks
    function aggregateWeeklyData(data) {
        const weeklyData = {};
        
        for (const [domain, dates] of Object.entries(data)) {
            if (typeof dates !== 'object' || dates === null) continue;

            const weekMap = {};
            
            for (const [date, value] of Object.entries(dates)) {
                if (typeof value !== 'number') continue;
                
                const weekRange = getWeekRange(date);
                const weekKey = `${weekRange.start}_${weekRange.end}`;
                
                if (!weekMap[weekKey]) {
                    weekMap[weekKey] = { range: weekRange, total: 0 };
                }
                weekMap[weekKey].total += value;
            }

            if (Object.keys(weekMap).length > 0) {
                weeklyData[domain] = weekMap;
            }
        }

        return weeklyData;
    }

    // Convert filtered data to array format for display
    function convertDataToArray(data, isWeekly = false) {
        const result = [];
        
        if (isWeekly) {
            // For weekly view, aggregate by weeks
            const weeklyData = aggregateWeeklyData(data);
            
            for (const [domain, weeks] of Object.entries(weeklyData)) {
                let total = 0;
                for (const week of Object.values(weeks)) {
                    total += week.total;
                }
                result.push([domain, total]);
            }
        } else {
            // For daily view, sum all dates per domain
            for (const [domain, dates] of Object.entries(data)) {
                if (typeof dates !== 'object' || dates === null) continue;
                
                let total = 0;
                for (const value of Object.values(dates)) {
                    if (typeof value === 'number') {
                        total += value;
                    }
                }
                
                if (total > 0) {
                    result.push([domain, total]);
                }
            }
        }
        
        return result.sort((a, b) => b[1] - a[1]);
    }

    function updateStats() {
        chrome.storage.local.get(['timeData', 'gotchaStats'], (result) => {
            const dateRange = getDateRange(currentPeriod);
            // Note: Weekly aggregation is available but not used by default
            // Set isWeekly to true if you want to group by weeks (Mon-Sun)
            const isWeekly = false;
            
            // Filter time data
            let filteredTimeData = result.timeData || {};
            if (dateRange && (dateRange.start || dateRange.end)) {
                filteredTimeData = filterDataByDateRange(filteredTimeData, dateRange.start, dateRange.end);
            }
            
            // Convert to array format
            const sortedTimeSites = convertDataToArray(filteredTimeData, isWeekly);
    
            // Time Stats
            timeStatsList.innerHTML = '';
            if (sortedTimeSites.length === 0) {
                timeStatsList.innerHTML = '<div class="stat-item">No time tracking data for selected period.</div>';
                document.getElementById('timeChart').style.display = 'none';
            } else {
                document.getElementById('timeChart').style.display = 'block';
                sortedTimeSites.forEach(([site, time]) => {
                    const statItem = createStatItem(site, formatTime(time), timeChart, timeStatsList);
                    timeStatsList.appendChild(statItem);
                });
                renderPieChart(sortedTimeSites);
            }

            // Filter gotcha data
            let filteredGotchaData = result.gotchaStats || {};
            if (dateRange && (dateRange.start || dateRange.end)) {
                filteredGotchaData = filterDataByDateRange(filteredGotchaData, dateRange.start, dateRange.end);
            }
            
            // Convert to array format
            const sortedGotchaSites = convertDataToArray(filteredGotchaData, isWeekly);

            // Gotcha Stats
            gotchaStatsList.innerHTML = '';
            if (sortedGotchaSites.length === 0) {
                gotchaStatsList.innerHTML = '<div class="stat-item">No "gotcha" data for selected period.</div>';
                document.getElementById('gotchaChart').style.display = 'none';
            } else {
                document.getElementById('gotchaChart').style.display = 'block';
                sortedGotchaSites.forEach(([site, count]) => {
                    const statItem = createStatItem(site, `${count} times`, gotchaChart, gotchaStatsList);
                    gotchaStatsList.appendChild(statItem);
                });
                renderGotchaChart(sortedGotchaSites);
            }
        });
    }

    function removeStatEntry(statType, siteToRemove) {
        chrome.storage.local.get([statType], (result) => {
            const stats = result[statType];
            if (stats && stats[siteToRemove]) {
                delete stats[siteToRemove];
                let dataToSet = {};
                dataToSet[statType] = stats;
                chrome.storage.local.set(dataToSet, () => {
                    updateStats();
                });
            }
        });
    }

    function createStatItem(site, value, chart, listElement) {
        const statItem = document.createElement('div');
        statItem.className = 'stat-item';
        statItem.dataset.site = site;

        if (chart) {
            const index = chart.data.labels.indexOf(site);
            if (index !== -1 && !chart.getDataVisibility(index)) {
                statItem.classList.add('disabled');
            }
        }

        const siteText = document.createElement('span');
        siteText.textContent = site;

        const valueContainer = document.createElement('div');
        valueContainer.className = 'value-container';

        const valueText = document.createElement('span');
        valueText.textContent = value;

        const deleteBtn = document.createElement('span');
        deleteBtn.className = 'delete-stat-btn';
        deleteBtn.textContent = '❌';

        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const statType = listElement.id === 'statsList' ? 'timeData' : 'gotchaStats';
            if (confirm(`Are you sure you want to delete stats for "${site}"?`)) {
                removeStatEntry(statType, site);
            }
        });

        valueContainer.appendChild(valueText);
        valueContainer.appendChild(deleteBtn);

        statItem.appendChild(siteText);
        statItem.appendChild(valueContainer);

        statItem.addEventListener('click', () => {
            if (!chart) return;
            const index = chart.data.labels.indexOf(site);
            if (index !== -1) {
                chart.toggleDataVisibility(index);
                chart.update();
                statItem.classList.toggle('disabled', !chart.getDataVisibility(index));
            }
        });

        statItem.addEventListener('mouseover', () => {
            if (!chart) return;
            const index = chart.data.labels.indexOf(site);
            if (index !== -1) {
                chart.setActiveElements([{ datasetIndex: 0, index: index }]);
                chart.update();
            }
        });

        statItem.addEventListener('mouseout', () => {
            if (!chart) return;
            chart.setActiveElements([]);
            chart.update();
        });

        return statItem;
    }

    function renderPieChart(data) {
        const labels = data.map(item => item[0]);
        const values = data.map(item => item[1]);

        if (timeChart) {
            timeChart.data.labels = labels;
            timeChart.data.datasets[0].data = values;
            timeChart.update();
            return;
        }

        timeChart = new Chart(timeChartCanvas, {
            type: 'pie',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Time Spent (seconds)',
                    data: values,
                    backgroundColor: [
                        'rgba(255, 99, 132, 0.7)',
                        'rgba(54, 162, 235, 0.7)',
                        'rgba(255, 206, 86, 0.7)',
                        'rgba(75, 192, 192, 0.7)',
                        'rgba(153, 102, 255, 0.7)',
                        'rgba(255, 159, 64, 0.7)'
                    ],
                    borderColor: [
                        'rgba(255, 99, 132, 1)',
                        'rgba(54, 162, 235, 1)',
                        'rgba(255, 206, 86, 1)',
                        'rgba(75, 192, 192, 1)',
                        'rgba(153, 102, 255, 1)',
                        'rgba(255, 159, 64, 1)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: 'white'
                        },
                        onClick: (e, legendItem, legend) => {
                            const index = legendItem.index;
                            const ci = legend.chart;
                            
                            ci.toggleDataVisibility(index);
                            ci.update();

                            const isVisible = ci.getDataVisibility(index);
                            const statItem = timeStatsList.querySelector(`.stat-item[data-site="${legendItem.text}"]`);
                            if (statItem) {
                                statItem.classList.toggle('disabled', !isVisible);
                            }
                        },
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed !== null) {
                                    label += formatTime(context.parsed);
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    }

    function renderGotchaChart(data) {
        const labels = data.map(item => item[0]);
        const values = data.map(item => item[1]);

        if (gotchaChart) {
            gotchaChart.data.labels = labels;
            gotchaChart.data.datasets[0].data = values;
            gotchaChart.update();
            return;
        }

        gotchaChart = new Chart(gotchaChartCanvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: '"Gotcha" Count',
                    data: values,
                    backgroundColor: 'rgba(255, 99, 132, 0.7)',
                    borderColor: 'rgba(255, 99, 132, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: 'white'
                        }
                    },
                    y: {
                        ticks: {
                            color: 'white'
                        }
                    }
                }
            }
        });
    }

    // Function to remove data within date range
    function removeDataInRange(data, startDate, endDate) {
        console.log('removeDataInRange called with:', { startDate, endDate, dataKeys: Object.keys(data) });
        
        if (!startDate && !endDate) {
            // If no date range, remove all data
            console.log('No date range provided, removing all data');
            return {};
        }

        const cleaned = {};
        for (const [domain, dates] of Object.entries(data)) {
            console.log(`Processing domain: ${domain}, dates type:`, typeof dates, dates);
            
            if (typeof dates !== 'object' || dates === null) {
                console.log(`Skipping ${domain} - not an object or null`);
                continue;
            }

            const cleanedDates = {};
            let removedCount = 0;
            let keptCount = 0;
            
            for (const [date, value] of Object.entries(dates)) {
                // Check if date is within the range to remove
                // Date is in range if: (startDate is null or date >= startDate) AND (endDate is null or date <= endDate)
                const isInRange = (!startDate || date >= startDate) && (!endDate || date <= endDate);
                
                console.log(`  Date ${date}: value=${value}, isInRange=${isInRange}, startDate=${startDate}, endDate=${endDate}`);
                
                // Keep dates outside the range (not in range)
                if (!isInRange) {
                    cleanedDates[date] = value;
                    keptCount++;
                } else {
                    removedCount++;
                }
            }

            console.log(`Domain ${domain}: kept ${keptCount} dates, removed ${removedCount} dates`);

            // Only keep domain if it has remaining dates
            if (Object.keys(cleanedDates).length > 0) {
                cleaned[domain] = cleanedDates;
                console.log(`Domain ${domain} kept with ${Object.keys(cleanedDates).length} dates`);
            } else {
                console.log(`Domain ${domain} removed (no dates remaining)`);
            }
        }

        console.log('Final cleaned data:', cleaned);
        return cleaned;
    }

    clearTimeStatsBtn.addEventListener('click', () => {
        console.log('=== CLEAR TIME STATS BUTTON CLICKED ===');
        const dateRange = getDateRange(currentPeriod);
        console.log('1. currentPeriod:', currentPeriod);
        console.log('2. dateRange from getDateRange:', dateRange);
        
        let confirmMessage = 'Are you sure you want to clear time statistics? This cannot be undone.';
        
        if (dateRange && (dateRange.start || dateRange.end)) {
            const periodName = currentPeriod === 'week' ? 'ostatniego tygodnia' : 
                              currentPeriod === 'month' ? 'ostatniego miesiąca' : 
                              currentPeriod === 'custom' ? 'zaznaczonego zakresu' : 'wszystkich danych';
            confirmMessage = `Czy na pewno chcesz usunąć statystyki czasu z ${periodName}? Ta operacja nie może być cofnięta.`;
            console.log('3. Confirm message set for period:', periodName);
        } else {
            confirmMessage = 'Czy na pewno chcesz usunąć wszystkie statystyki czasu? Ta operacja nie może być cofnięta.';
            console.log('3. Confirm message set for ALL data');
        }

        console.log('4. Showing confirm dialog...');
        if (confirm(confirmMessage)) {
            console.log('5. User confirmed, getting data from storage...');
            chrome.storage.local.get(['timeData'], (result) => {
                console.log('6. Got data from storage:', result);
                const timeData = result.timeData || {};
                console.log('7. timeData:', timeData);
                console.log('8. dateRange:', dateRange);
                console.log('9. currentPeriod:', currentPeriod);
                
                let cleanedData = timeData;

                // Check if we have a valid date range (not "all" period)
                console.log('10. Checking conditions...');
                console.log('   - currentPeriod !== "all":', currentPeriod !== 'all');
                console.log('   - dateRange exists:', !!dateRange);
                console.log('   - dateRange.start:', dateRange?.start);
                console.log('   - dateRange.end:', dateRange?.end);
                console.log('   - dateRange.start || dateRange.end:', dateRange?.start || dateRange?.end);
                
                if (currentPeriod !== 'all' && dateRange && (dateRange.start || dateRange.end)) {
                    console.log('11. ENTERING: Removing data in range');
                    console.log('    Calling removeDataInRange with:', {
                        timeDataKeys: Object.keys(timeData),
                        startDate: dateRange.start,
                        endDate: dateRange.end
                    });
                    cleanedData = removeDataInRange(timeData, dateRange.start, dateRange.end);
                    console.log('12. RETURNED from removeDataInRange, cleanedData:', cleanedData);
                } else if (currentPeriod === 'all') {
                    // For "all" period, remove everything
                    console.log('11. ENTERING: Removing all data (all period)');
                    cleanedData = {};
                } else {
                    // Fallback: remove all if no valid range
                    console.log('11. ENTERING: No valid range, removing all data');
                    cleanedData = {};
                }

                console.log('13. Final cleanedData before save:', cleanedData);
                chrome.storage.local.set({ timeData: cleanedData }, () => {
                    console.log('14. Data saved to storage');
                    if (timeChart) {
                        timeChart.destroy();
                        timeChart = null;
                    }
                    updateStats();
                });
            });
        } else {
            console.log('5. User cancelled');
        }
    });

    clearGotchaStatsBtn.addEventListener('click', () => {
        const dateRange = getDateRange(currentPeriod);
        let confirmMessage = 'Are you sure you want to clear "gotcha" statistics? This cannot be undone.';
        
        if (dateRange && (dateRange.start || dateRange.end)) {
            const periodName = currentPeriod === 'week' ? 'ostatniego tygodnia' : 
                              currentPeriod === 'month' ? 'ostatniego miesiąca' : 
                              currentPeriod === 'custom' ? 'zaznaczonego zakresu' : 'wszystkich danych';
            confirmMessage = `Czy na pewno chcesz usunąć statystyki "gotcha" z ${periodName}? Ta operacja nie może być cofnięta.`;
        } else {
            confirmMessage = 'Czy na pewno chcesz usunąć wszystkie statystyki "gotcha"? Ta operacja nie może być cofnięta.';
        }

        if (confirm(confirmMessage)) {
            chrome.storage.local.get(['gotchaStats'], (result) => {
                const gotchaStats = result.gotchaStats || {};
                let cleanedData = gotchaStats;

                // Check if we have a valid date range (not "all" period)
                if (currentPeriod !== 'all' && dateRange && (dateRange.start || dateRange.end)) {
                    console.log('Removing gotcha data in range:', dateRange);
                    cleanedData = removeDataInRange(gotchaStats, dateRange.start, dateRange.end);
                    console.log('Cleaned gotcha data:', cleanedData);
                } else if (currentPeriod === 'all') {
                    // For "all" period, remove everything
                    cleanedData = {};
                } else {
                    // Fallback: remove all if no valid range
                    cleanedData = {};
                }

                chrome.storage.local.set({ gotchaStats: cleanedData }, () => {
                    if (gotchaChart) {
                        gotchaChart.destroy();
                        gotchaChart = null;
                    }
                    updateStats();
                });
            });
        }
    });

    // Tab handling
    const tabs = document.querySelectorAll('.tab');
    const dateRangePicker = document.getElementById('dateRangePicker');
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const applyDateRangeBtn = document.getElementById('applyDateRange');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs
            tabs.forEach(t => t.classList.remove('active'));
            // Add active class to clicked tab
            tab.classList.add('active');
            
            // Update current period
            currentPeriod = tab.dataset.period;
            
            // Show/hide date range picker
            if (currentPeriod === 'custom') {
                dateRangePicker.classList.add('active');
                // Set default dates (last 7 days)
                const today = new Date();
                const weekAgo = new Date(today);
                weekAgo.setDate(weekAgo.getDate() - 6);
                startDateInput.value = formatDate(weekAgo);
                endDateInput.value = formatDate(today);
            } else {
                dateRangePicker.classList.remove('active');
                customDateRange = { start: null, end: null };
            }
            
            // Update stats
            updateStats();
        });
    });

    // Apply custom date range
    applyDateRangeBtn.addEventListener('click', () => {
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;
        
        if (!startDate || !endDate) {
            alert('Proszę wybrać obie daty');
            return;
        }
        
        if (startDate > endDate) {
            alert('Data początkowa nie może być późniejsza niż data końcowa');
            return;
        }
        
        customDateRange = { start: startDate, end: endDate };
        updateStats();
    });

    // Export/Import functionality
    const exportBtn = document.getElementById('exportBtn');
    const importBtn = document.getElementById('importBtn');
    const importFileInput = document.getElementById('importFileInput');
    const messageDiv = document.getElementById('message');

    function showMessage(text, isError = false) {
        messageDiv.textContent = text;
        messageDiv.className = isError ? 'message error' : 'message success';
        setTimeout(() => {
            messageDiv.className = 'message';
            messageDiv.textContent = '';
        }, 5000);
    }

    function exportStats() {
        chrome.storage.local.get(['timeData', 'gotchaStats'], (result) => {
            const dateRange = getDateRange(currentPeriod);
            
            // Filter data based on current period
            let exportTimeData = result.timeData || {};
            let exportGotchaStats = result.gotchaStats || {};
            
            if (dateRange && (dateRange.start || dateRange.end)) {
                exportTimeData = filterDataByDateRange(exportTimeData, dateRange.start, dateRange.end);
                exportGotchaStats = filterDataByDateRange(exportGotchaStats, dateRange.start, dateRange.end);
            }

            const exportData = {
                exportDate: new Date().toISOString(),
                period: {
                    type: currentPeriod,
                    start: dateRange?.start || null,
                    end: dateRange?.end || null
                },
                timeData: exportTimeData,
                gotchaStats: exportGotchaStats
            };

            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `stats-export-${currentPeriod}-${formatDate(new Date())}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showMessage('Dane zostały wyeksportowane pomyślnie!');
        });
    }

    function validateImportData(data) {
        // Check if data is an object
        if (typeof data !== 'object' || data === null) {
            return { valid: false, error: 'Plik nie zawiera prawidłowego obiektu JSON' };
        }

        // Check if timeData or gotchaStats exist
        if (!data.timeData && !data.gotchaStats) {
            return { valid: false, error: 'Plik nie zawiera danych timeData ani gotchaStats' };
        }

        // Validate timeData structure
        if (data.timeData) {
            if (typeof data.timeData !== 'object' || data.timeData === null) {
                return { valid: false, error: 'timeData musi być obiektem' };
            }

            for (const [domain, dates] of Object.entries(data.timeData)) {
                if (typeof dates !== 'object' || dates === null) {
                    return { valid: false, error: `timeData dla ${domain} musi być obiektem z datami` };
                }

                for (const [date, value] of Object.entries(dates)) {
                    // Validate date format (YYYY-MM-DD)
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                        return { valid: false, error: `Nieprawidłowy format daty w timeData: ${date}` };
                    }

                    // Validate value is a number
                    if (typeof value !== 'number' || value < 0) {
                        return { valid: false, error: `Wartość dla ${domain} w dniu ${date} musi być liczbą nieujemną` };
                    }
                }
            }
        }

        // Validate gotchaStats structure
        if (data.gotchaStats) {
            if (typeof data.gotchaStats !== 'object' || data.gotchaStats === null) {
                return { valid: false, error: 'gotchaStats musi być obiektem' };
            }

            for (const [domain, dates] of Object.entries(data.gotchaStats)) {
                if (typeof dates !== 'object' || dates === null) {
                    return { valid: false, error: `gotchaStats dla ${domain} musi być obiektem z datami` };
                }

                for (const [date, value] of Object.entries(dates)) {
                    // Validate date format (YYYY-MM-DD)
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                        return { valid: false, error: `Nieprawidłowy format daty w gotchaStats: ${date}` };
                    }

                    // Validate value is a number
                    if (typeof value !== 'number' || value < 0) {
                        return { valid: false, error: `Wartość dla ${domain} w dniu ${date} musi być liczbą nieujemną` };
                    }
                }
            }
        }

        return { valid: true };
    }

    function importStats(file) {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const jsonData = JSON.parse(e.target.result);
                const validation = validateImportData(jsonData);

                if (!validation.valid) {
                    showMessage(`Błąd walidacji: ${validation.error}`, true);
                    return;
                }

                // Confirm import
                if (!confirm('Czy na pewno chcesz zaimportować te dane? Wszystkie istniejące dane zostaną nadpisane.')) {
                    return;
                }

                // Prepare data to save
                const dataToSave = {};

                if (jsonData.timeData) {
                    dataToSave.timeData = jsonData.timeData;
                }

                if (jsonData.gotchaStats) {
                    dataToSave.gotchaStats = jsonData.gotchaStats;
                }

                // Save imported data (overwrite existing)
                chrome.storage.local.set(dataToSave, () => {
                    showMessage('Dane zostały zaimportowane pomyślnie!');
                    updateStats();
                });

            } catch (error) {
                showMessage(`Błąd podczas parsowania pliku JSON: ${error.message}`, true);
            }
        };

        reader.onerror = () => {
            showMessage('Błąd podczas odczytu pliku', true);
        };

        reader.readAsText(file);
    }

    // Event listeners for export/import
    exportBtn.addEventListener('click', exportStats);

    importBtn.addEventListener('click', () => {
        importFileInput.click();
    });

    importFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
                showMessage('Proszę wybrać plik JSON', true);
                return;
            }
            importStats(file);
            // Reset input so the same file can be selected again
            importFileInput.value = '';
        }
    });

    // Initial update
    updateStats();

    // Set up auto-refresh
    intervalId = setInterval(updateStats, 5000);

    // Clean up the interval when the page is hidden
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            clearInterval(intervalId);
        } else {
            intervalId = setInterval(updateStats, 5000);
        }
    });
} 