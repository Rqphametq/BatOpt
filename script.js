// --- VARIABLES GLOBALES STRICTES ---
let originalLoad48 = null; 
let irradianceData24 = null; 
let irradianceSeasons = { winter: null, spring: null, summer: null };
let currentLat = 48.85, currentLon = 2.35; // Paris par défaut

// --- INITIALISATION GRAPHIQUE ---
const labels48 = Array.from({length: 48}, (_, i) => {
    return `${Math.floor(i / 2).toString().padStart(2, '0')}:${i % 2 === 0 ? '00' : '30'}`;
});

const ctx = document.getElementById('loadChart').getContext('2d');
let batChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: labels48,
        datasets: [
            { label: 'Conso Nette sans BESS (kW)', data: [], borderColor: '#e74c3c', fill: false, tension: 0.3, pointRadius: 0 },
            { label: 'Production Solaire PV (kW)', data: [], borderColor: '#f1c40f', backgroundColor: 'rgba(241, 196, 15, 0.2)', fill: true, tension: 0.3, pointRadius: 0 },
            { label: 'Conso Réseau Finale (kW)', data: [], borderColor: '#18BC9C', backgroundColor: 'rgba(24, 188, 156, 0.1)', fill: true, tension: 0.3, pointRadius: 0 }
        ]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
});

// --- ECOUTEURS UI ---
const inputs = ['cap', 'pow', 'cost', 'thp', 'thc', 'pcost', 'pv', 'area', 'rte', 'feedin', 'duration', 'opex'];
inputs.forEach(id => {
    document.getElementById(id).addEventListener('input', function() {
        document.getElementById(`${id}-val`).innerText = this.value;
        if(originalLoad48 && irradianceSeasons && irradianceSeasons.summer) runSimulation(); 
    });
});

document.getElementById('profile').addEventListener('change', loadLocalEnedisData);
document.getElementById('season').addEventListener('change', () => {
    if(originalLoad48 && irradianceSeasons && irradianceSeasons.summer) runSimulation();
});

// --- 1. RECHERCHE VILLE (VIA OPEN-METEO GEOCODING - ANTI-BLOCAGE) ---
const cityInput = document.getElementById('city-input');
const btnSearch = document.getElementById('btn-search-city');

async function searchCity(e) {
    // 1. On bloque tout rafraîchissement accidentel de la page
    if(e) e.preventDefault(); 
    
    const val = cityInput.value;
    if (val.length < 3) return;
    
    document.getElementById('city-result').innerText = "⏳ Recherche de la ville...";
    try {
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(val)}&count=1&language=fr&format=json`);
        
        if (!res.ok) throw new Error(`Blocage serveur (Code ${res.status})`);
        
        const data = await res.json();
        
        if(data.results && data.results.length > 0) {
            const city = data.results[0];
            currentLat = city.latitude;
            currentLon = city.longitude;
            document.getElementById('city-result').innerText = `📍 ${city.name} (${city.country}) : ${currentLat.toFixed(2)}°N, ${currentLon.toFixed(2)}°E`;
            fetchSolarData(); 
        } else {
            document.getElementById('city-result').innerText = "❌ Ville introuvable.";
        }
    } catch(err) { 
        console.error("Détail de l'erreur :", err);
        // 2. FILET DE SÉCURITÉ : Si le réseau ou l'API bloque, on force la simulation quand même !
        document.getElementById('city-result').innerText = `⚠️ Réseau bloqué : Mode démo activé pour "${val}".`;
        fetchSolarData(); // On lance les calculs avec la ville précédente ou par défaut
    }
}

// On s'assure de transmettre l'événement "e" pour le bloquer
btnSearch.addEventListener('click', (e) => searchCity(e));
cityInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchCity(e);
});

// --- 2. BASE DE DONNÉES ENEDIS INTÉGRÉE (100% HORS-LIGNE) ---
const localEnedisProfiles = {
    "ENT1": [0.6, 0.6, 0.5, 0.5, 0.5, 0.5, 0.6, 0.8, 1.2, 1.8, 2.5, 3.2, 3.8, 4.2, 4.5, 4.6, 4.5, 4.4, 4.2, 4.0, 3.8, 3.6, 3.8, 4.0, 4.2, 4.5, 4.6, 4.5, 4.2, 3.8, 3.5, 3.2, 2.8, 2.5, 2.0, 1.5, 1.2, 1.0, 0.8, 0.7, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6], 
    "ENT2": [1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.6, 2.0, 3.0, 4.0, 4.5, 4.8, 5.0, 5.0, 4.8, 4.5, 4.5, 4.5, 4.2, 4.0, 3.8, 3.8, 4.0, 4.2, 4.5, 4.8, 5.0, 5.0, 4.8, 4.5, 4.0, 3.5, 3.0, 2.5, 2.0, 1.8, 1.6, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5], 
    "PRO2": [0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.4, 0.6, 1.0, 2.0, 3.5, 4.5, 4.8, 5.0, 4.8, 4.5, 4.0, 3.8, 4.5, 5.0, 4.8, 4.5, 4.2, 4.0, 3.8, 3.5, 3.0, 2.5, 2.0, 1.5, 1.0, 0.8, 0.6, 0.5, 0.4, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3]  
};

function loadLocalEnedisData() {
    let profileCode = document.getElementById('profile').value;
    
    if (!profileCode || profileCode === "") {
        document.getElementById('data-source-status').innerText = "⚠️ En attente : Veuillez sélectionner un type d'activité.";
        originalLoad48 = null;
        batChart.data.datasets.forEach(dataset => dataset.data = []);
        batChart.update();
        return; 
    }

    if (profileCode === "supermarket") profileCode = "ENT1";
    if (profileCode === "factory") profileCode = "ENT2";
    if (profileCode === "office") profileCode = "PRO2";

    originalLoad48 = localEnedisProfiles[profileCode];
    document.getElementById('data-source-status').innerText = "✅ Profil Enedis chargé.";
    
    if(irradianceSeasons && irradianceSeasons.summer) runSimulation();
}

// --- 3. API SOLAIRE (CALCUL SIMULTANÉ DES 3 SAISONS SUR 5 ANS) ---
async function fetchSolarData() {
    const statusLabel = document.getElementById('data-source-status');
    statusLabel.innerText = `⏳ Analyse climatologique annuelle en cours (5 ans)...`;
    
    try {
        const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${currentLat}&longitude=${currentLon}&start_date=2019-01-01&end_date=2023-12-31&hourly=shortwave_radiation&timezone=auto`;
        const res = await fetch(url);
        if(!res.ok) throw new Error("Erreur Open-Meteo Archive");
        const data = await res.json();
        
        let sumW = new Array(24).fill(0), countW = 0; 
        let sumS = new Array(24).fill(0), countS = 0; 
        let sumM = new Array(24).fill(0), countM = 0; 
        
        const hourlyData = data.hourly.shortwave_radiation;
        const totalHours = hourlyData.length;
        
        for (let i = 0; i < totalHours; i++) {
            let timeString = data.hourly.time[i]; 
            let month = timeString.substring(5, 7); 
            let hour = parseInt(timeString.substring(11, 13)); 
            let val = hourlyData[i] || 0;
            
            if (["12", "01", "02"].includes(month)) { sumW[hour] += val; if(hour===0) countW++; }
            else if (["06", "07", "08"].includes(month)) { sumS[hour] += val; if(hour===0) countS++; }
            else { sumM[hour] += val; if(hour===0) countM++; }
        }

        irradianceSeasons.winter = sumW.map(v => countW ? v / countW : 0);
        irradianceSeasons.summer = sumS.map(v => countS ? v / countS : 0);
        irradianceSeasons.spring = sumM.map(v => countM ? v / countM : 0);
        
        statusLabel.innerText = `✅ Climatologie annuelle validée (Moyenne 5 ans).`;
        
        if(originalLoad48) runSimulation();
        
    } catch(err) {
        console.error("Détail du crash météo :", err);
        statusLabel.innerText = `⚠️ Erreur réseau : Modèles solaires de secours activés.`;
        irradianceSeasons.winter = [0,0,0,0,0,0,0,0,10,100,250,400,450,400,250,100,10,0,0,0,0,0,0,0];
        irradianceSeasons.spring = [0,0,0,0,0,0,10,80,200,400,600,750,800,750,600,400,200,80,10,0,0,0,0,0];
        irradianceSeasons.summer = [0,0,0,0,0,10,50,150,300,500,750,900,950,900,750,500,300,150,50,10,0,0,0,0];
        if(originalLoad48) runSimulation();
    }
}

// --- 4. MOTEUR DE CALCUL (FONCTION ISOLÉE POUR 1 JOUR) ---
function simulateDay(irradiance24_array, overrideC = null, overrideP = null) {
    const C = overrideC !== null ? overrideC : parseFloat(document.getElementById('cap').value);
    const P = overrideP !== null ? overrideP : parseFloat(document.getElementById('pow').value);
    const tHP = parseFloat(document.getElementById('thp').value);
    const tHC = parseFloat(document.getElementById('thc').value);
    const PV = parseFloat(document.getElementById('pv').value);
    const Area = parseFloat(document.getElementById('area').value);
    
    // NOUVEAU : On récupère le rendement depuis l'UI (ex: 90%)
    const rteGlobal = parseFloat(document.getElementById('rte').value) / 100;

    const peakPower = 0.05; 
    // Calcul automatique du rendement asymétrique (racine carrée du RTE)
    const eta = Math.sqrt(rteGlobal);

    let solarProd48 = new Array(48).fill(0), netLoad48 = new Array(48).fill(0), finalGridLoad48 = new Array(48).fill(0);
    let soc = 0; 
    const hc_steps = Array.from({length: 12}, (_, i) => i);
    const hp_steps = Array.from({length: 36}, (_, i) => i + 12);

    // 1. Production Solaire & Charge de l'excédent
    for(let i=0; i<48; i++) {
        let rawLoad = originalLoad48[i] * Area * peakPower; 
        let hour = Math.floor(i / 2);
        solarProd48[i] = PV * (irradiance24_array[hour] / 1000) * 0.85;
        netLoad48[i] = rawLoad - solarProd48[i];
        finalGridLoad48[i] = netLoad48[i]; 
        
        if(netLoad48[i] < 0) { 
            let surplusPower = Math.abs(netLoad48[i]);
            // On limite la charge par P, et par la place restante divisée par le rendement
            let chargePower = Math.min(surplusPower, P, (C - soc) / (0.5 * eta));
            soc += chargePower * 0.5 * eta; // Seule une partie de l'énergie entre réellement dans la batterie
            finalGridLoad48[i] += chargePower; 
        }
    }

    // 2. Recharge forcée sur le réseau (Heures Creuses)
    for(let i of hc_steps) { 
        if(finalGridLoad48[i] > 0) {
            let chargePower = Math.min(P, (C - soc) / (0.5 * eta));
            soc += chargePower * 0.5 * eta; 
            finalGridLoad48[i] += chargePower;
        }
    }

    // 3. Calcul du seuil optimal d'écrêtement (Recherche Dichotomique)
    let maxInitialPeak = Math.max(...finalGridLoad48.filter((_, i) => hp_steps.includes(i)));
    let minPossiblePeak = 0, targetLimit = maxInitialPeak;

    for(let step = 0; step < 50; step++) {
        let mid = (maxInitialPeak + minPossiblePeak) / 2;
        let energyNeeded_kWh = 0;
        for(let i of hp_steps) {
            if(finalGridLoad48[i] > mid) {
                // Pour fournir "X" kW au réseau, la batterie doit fournir "X / eta" kW en interne
                energyNeeded_kWh += Math.min(P, finalGridLoad48[i] - mid) * 0.5 / eta;
            }
        }
        if(energyNeeded_kWh <= soc) { targetLimit = mid; maxInitialPeak = mid; } 
        else { minPossiblePeak = mid; }
    }

    // 4. Décharge réelle pour l'écrêtement
    for(let i of hp_steps) {
        if(finalGridLoad48[i] > targetLimit && soc > 0) {
            // La puissance max restituable est bridée par le rendement à la décharge
            let dischargePower = Math.min((soc * eta) / 0.5, P, finalGridLoad48[i] - targetLimit);
            soc -= (dischargePower * 0.5) / eta; // La batterie se vide plus vite que ce qu'elle donne
            finalGridLoad48[i] -= dischargePower;
        }
    }

    // 5. Calculs financiers
  let costOld = 0, costNew = 0, feedInRevenue = 0;
    const feedInTariff = parseFloat(document.getElementById('feedin').value);

    for(let i=0; i<48; i++) {
        let tarif = hc_steps.includes(i) ? tHC : tHP;
        let rawLoad = originalLoad48[i] * Area * peakPower; 
        
        // Ancienne facture (sans solaire ni batterie)
        costOld += (rawLoad * 0.5) * tarif; 
        
        if(finalGridLoad48[i] > 0) {
            // Soutirage au réseau (Nouvelle facture)
            costNew += (finalGridLoad48[i] * 0.5) * tarif;
        } else if (finalGridLoad48[i] < 0) {
            // L'énergie résiduelle négative est l'excédent injecté sur le réseau
            feedInRevenue += Math.abs(finalGridLoad48[i] * 0.5) * feedInTariff;
        }
    }
    
    let peakOld = Math.max(...originalLoad48.map(v => v * Area * peakPower));
    let peakNew = Math.max(...finalGridLoad48);
    
    // L'économie totale = (Ancienne facture - Nouvelle facture) + Revenus d'injection PV
    const dailyTotalSavings = (costOld - costNew) + feedInRevenue;

    return { dailyEnergySavings: dailyTotalSavings, peakOld, peakNew, solarProd48, finalGridLoad48 };
}

// --- 5. ALGORITHME PRINCIPAL ET PONDÉRATION ANNUELLE ---
function runSimulation() {
    if(!originalLoad48 || !irradianceSeasons.summer) return;

    // Simulation des 3 journées types
    const resWinter = simulateDay(irradianceSeasons.winter);
    const resSpring = simulateDay(irradianceSeasons.spring);
    const resSummer = simulateDay(irradianceSeasons.summer);

    // Pondération annuelle (Gains énergie + Revente PV)
    const annualEnergySavings = (resWinter.dailyEnergySavings * 90) + (resSpring.dailyEnergySavings * 183) + (resSummer.dailyEnergySavings * 92);
    
    // Calcul des gains sur l'écrêtement (TURPE)
    const pCost = parseFloat(document.getElementById('pcost').value);
    const maxGlobalOldPeak = Math.max(resWinter.peakOld, resSpring.peakOld, resSummer.peakOld);
    const maxGlobalNewPeak = Math.max(resWinter.peakNew, resSpring.peakNew, resSummer.peakNew);
    const annualPeakSavings = (maxGlobalOldPeak - maxGlobalNewPeak) * pCost;

    const totalSavingsY1 = annualEnergySavings + annualPeakSavings; 
    
    // CAPEX
    const C = parseFloat(document.getElementById('cap').value);
    const costPerKwh = parseFloat(document.getElementById('cost').value);
    const capex = C * costPerKwh; 

    let cumulativeSavings = 0;
    let roi = 0;
    
    // NOUVEAU : Récupération de la durée et de l'OPEX depuis l'interface
    const maxYears = parseInt(document.getElementById('duration').value);
    const annualOpex = capex * (parseFloat(document.getElementById('opex').value) / 100);

    if (totalSavingsY1 > 0) {
        for (let year = 1; year <= maxYears; year++) {
            let degradation = Math.pow(0.98, year - 1);
            let inflation = Math.pow(1.03, year - 1);
            
            // Gain de l'année = Économies (avec vieillissement/inflation) - Frais de maintenance
            let netSavingsThisYear = (totalSavingsY1 * degradation * inflation) - annualOpex;
            
            // CHOC FINANCIER : Remplacement des cellules LFP à l'année 15 (60% du CAPEX initial)
            if (year === 15) {
                netSavingsThisYear -= (capex * 0.60);
            }
            
            // Calcul précis du ROI (croisement de la ligne de rentabilité)
            if (roi === 0 && cumulativeSavings + netSavingsThisYear >= capex) {
                let remainingToPay = capex - cumulativeSavings;
                // On s'assure de ne pas diviser par un chiffre négatif si l'année 15 plombe le cashflow
                if(netSavingsThisYear > 0) {
                    roi = (year - 1) + (remainingToPay / netSavingsThisYear);
                }
            }
            cumulativeSavings += netSavingsThisYear;
        }
    }

    // Mise à jour de l'interface financière
    const fmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
    document.getElementById('res-capex').innerText = fmt.format(capex);
    // On affiche le gain de la 1ère année NET d'OPEX
    document.getElementById('res-savings').innerText = fmt.format(totalSavingsY1 - annualOpex);
    document.getElementById('res-roi').innerText = (roi > 0) ? roi.toFixed(1) + ' ans' : '> ' + maxYears + ' ans';

    // Mise à jour du graphique des courbes
    const selectedSeason = document.getElementById('season').value;
    const dataToDisplay = selectedSeason === 'winter' ? resWinter : (selectedSeason === 'spring' ? resSpring : resSummer);
    
    const Area = parseFloat(document.getElementById('area').value);
    batChart.data.datasets[0].data = originalLoad48.map(v => v * Area * 0.05);
    batChart.data.datasets[1].data = dataToDisplay.solarProd48;
    batChart.data.datasets[2].data = dataToDisplay.finalGridLoad48.map(v => Math.max(0, v)); 
    batChart.update();
}

// Lancement au chargement de la page
window.onload = () => { 
    loadLocalEnedisData(); 
    fetchSolarData();
};


// --- 6. MODULE D'OPTIMISATION (GAINS NETS CUMULÉS) ---
let optChartInstance = null;

document.getElementById('btn-optimize').addEventListener('click', () => {
    if(!originalLoad48 || !irradianceSeasons.summer) {
        alert("Veuillez d'abord sélectionner un profil et attendre le chargement météo.");
        return;
    }

    const btn = document.getElementById('btn-optimize');
    btn.innerText = "⏳ Calcul de 40 scénarios en cours...";
    
    // On utilise un setTimeout pour laisser le bouton s'actualiser avant de geler le navigateur avec les calculs
    setTimeout(() => {
        let results = [];
        let bestCap = 0;
        let bestProfit = -Infinity; // On cherche le profit maximum

        const costPerKwh = parseFloat(document.getElementById('cost').value);
        const pCost = parseFloat(document.getElementById('pcost').value);
        const maxYears = parseInt(document.getElementById('duration').value);
        const opexRate = parseFloat(document.getElementById('opex').value) / 100;

        // Boucle : Teste les batteries de 50 kWh à 2000 kWh
        for(let testC = 50; testC <= 2000; testC += 50) {
            let testP = testC * 0.5; // Ratio de puissance (C-Rate 0.5)
            
            const resW = simulateDay(irradianceSeasons.winter, testC, testP);
            const resSp = simulateDay(irradianceSeasons.spring, testC, testP);
            const resSu = simulateDay(irradianceSeasons.summer, testC, testP);
            
            const annualEnergySavings = (resW.dailyEnergySavings * 90) + (resSp.dailyEnergySavings * 183) + (resSu.dailyEnergySavings * 92);
            const maxGlobalOldPeak = Math.max(resW.peakOld, resSp.peakOld, resSu.peakOld);
            const maxGlobalNewPeak = Math.max(resW.peakNew, resSp.peakNew, resSu.peakNew);
            const annualPeakSavings = (maxGlobalOldPeak - maxGlobalNewPeak) * pCost;
            
            const totalSavingsY1 = annualEnergySavings + annualPeakSavings;
            const capex = testC * costPerKwh;
            const annualOpex = capex * opexRate;
            
            let cumulativeSavings = 0;
            
            // Simulation des gains cumulés sur toute la durée du projet
            for (let year = 1; year <= maxYears; year++) {
                let degradation = Math.pow(0.98, year - 1);
                let inflation = Math.pow(1.03, year - 1);
                let netSavingsThisYear = (totalSavingsY1 * degradation * inflation) - annualOpex;
                
                // Renouvellement cellules (Repowering)
                if (year === 15) {
                    netSavingsThisYear -= (capex * 0.60);
                }
                
                cumulativeSavings += netSavingsThisYear;
            }

            // Bénéfice net final = Tout ce qu'on a gagné - Le prix de la batterie
            let netProfit = cumulativeSavings - capex;

            results.push({ capacity: testC, profit: netProfit });
            
            if(netProfit > bestProfit) {
                bestProfit = netProfit;
                bestCap = testC;
            }
        }

        afficherModaleOptimisation(results, bestCap, bestProfit);
        btn.innerText = "🚀 Trouver le dimensionnement optimal";
    }, 100); 
});

function afficherModaleOptimisation(results, bestCap, bestProfit) {
    document.getElementById('opt-modal').style.display = 'flex';
    
    const fmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
    const maxYears = document.getElementById('duration').value;
    
    document.getElementById('opt-result').innerHTML = `
        🏆 Dimensionnement Optimal Trouvé : Batterie de <strong>${bestCap} kWh</strong> <br>
        Gains Nets (après remboursement du système) sur ${maxYears} ans : <strong>${fmt.format(bestProfit)}</strong>
    `;

    const ctxOpt = document.getElementById('optChart').getContext('2d');
    
    if(optChartInstance) optChartInstance.destroy();
    
    optChartInstance = new Chart(ctxOpt, {
        type: 'bar',
        data: {
            labels: results.map(r => r.capacity + ' kWh'),
            datasets: [{
                label: `Gains Nets sur ${maxYears} ans (€)`,
                data: results.map(r => r.profit),
                backgroundColor: results.map(r => r.capacity === bestCap ? '#10b981' : '#cbd5e1'), // Vert émeraude pour le gagnant
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: { callbacks: { label: (context) => `Gain Net : ${fmt.format(context.raw)}` } }
            },
            scales: { 
                y: { 
                    title: { display: true, text: 'Euros (€)' },
                    grid: { color: '#f1f5f9' }
                },
                x: {
                    grid: { display: false }
                }
            }
        }
    });
}

// --- FERMETURE DE LA MODALE ---
const btnCloseModal = document.getElementById('close-modal');
if (btnCloseModal) {
    btnCloseModal.addEventListener('click', () => {
        document.getElementById('opt-modal').style.display = 'none';
    });
}

// --- MODULE DOCUMENTATION (LECTURE DU README.MD) ---
const readmeModal = document.getElementById('readme-modal');
const btnReadme = document.getElementById('btn-readme');
const closeReadmeBtn = document.getElementById('close-readme');
const readmeContent = document.getElementById('readme-content');

if (btnReadme) {
    btnReadme.addEventListener('click', async () => {
        readmeModal.style.display = 'flex';
        readmeContent.innerHTML = "⏳ Chargement de la documentation...";
        
        try {
            const response = await fetch('README.md');
            if (response.ok) {
                const text = await response.text();
                // Vérifie si marked est bien disponible
                if (typeof marked !== 'undefined') {
                    readmeContent.innerHTML = marked.parse(text);
                } else {
                    readmeContent.innerHTML = `<pre style="white-space: pre-wrap;">${text}</pre>`;
                }
            } else {
                readmeContent.innerHTML = "<p>❌ Impossible de charger le README depuis GitHub (Erreur réseau ou CORS en local).</p>";
            }
        } catch(e) {
            readmeContent.innerHTML = "<p>❌ Erreur technique lors du chargement de la documentation.</p>";
        }
    });
}

// Gestion de la fermeture
if (closeReadmeBtn) {
    closeReadmeBtn.addEventListener('click', () => { readmeModal.style.display = 'none'; });
}
window.addEventListener('click', (event) => {
    if (event.target === readmeModal) { readmeModal.style.display = 'none'; }
});