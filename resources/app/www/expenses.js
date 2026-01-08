import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, getDocs, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDUtblUqNiSCmC4kRjikE7D2kba0Mhxej4",
    authDomain: "danfosal-app.firebaseapp.com",
    projectId: "danfosal-app",
    storageBucket: "danfosal-app.appspot.com",
    messagingSenderId: "565855692028",
    appId: "1:565855692028:web:c7cb647497cb3df9452379",
    measurementId: "G-50JPG2KKEC"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// State
let allExpenses = [];
let allSales = [];
let storeSalesData = [];
let onlineOrdersData = [];
let currentFilter = 'month'; // 'month' or 'all'

// DOM Elements
const expenseForm = document.getElementById('expense-form');
const expensesTableBody = document.getElementById('expenses-table-body');
const totalRevenueEl = document.getElementById('total-revenue');
const totalExpensesEl = document.getElementById('total-expenses');
const netProfitEl = document.getElementById('net-profit');
const filterMonthBtn = document.getElementById('filter-month');
const filterAllBtn = document.getElementById('filter-all');

// Initialize
const init = async () => {
    try {
        await signInAnonymously(auth);
        console.log("Signed in anonymously");

        // Set default date to today
        document.getElementById('expense-date').valueAsDate = new Date();

        setupListeners();
        subscribeToData();
    } catch (error) {
        console.error("Error initializing:", error);
    }
};

const setupListeners = () => {
    expenseForm.addEventListener('submit', handleAddExpense);
    
    filterMonthBtn.addEventListener('click', () => {
        currentFilter = 'month';
        updateFilterButtons();
        renderExpenses();
        calculateFinancials();
    });

    filterAllBtn.addEventListener('click', () => {
        currentFilter = 'all';
        updateFilterButtons();
        renderExpenses();
        calculateFinancials();
    });
};

const updateFilterButtons = () => {
    if (currentFilter === 'month') {
        filterMonthBtn.classList.remove('bg-gray-800', 'text-gray-400');
        filterMonthBtn.classList.add('bg-gray-700', 'text-white');
        filterAllBtn.classList.add('bg-gray-800', 'text-gray-400');
        filterAllBtn.classList.remove('bg-gray-700', 'text-white');
    } else {
        filterAllBtn.classList.remove('bg-gray-800', 'text-gray-400');
        filterAllBtn.classList.add('bg-gray-700', 'text-white');
        filterMonthBtn.classList.add('bg-gray-800', 'text-gray-400');
        filterMonthBtn.classList.remove('bg-gray-700', 'text-white');
    }
};

const subscribeToData = () => {
    // 1. Subscribe to Expenses
    const expensesQuery = query(collection(db, 'expenses'), orderBy('date', 'desc'));
    onSnapshot(expensesQuery, (snapshot) => {
        allExpenses = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        renderExpenses();
        calculateFinancials();
    });

    // 2. Subscribe to Store Sales
    const storeSalesQuery = query(collection(db, 'storeSales'), orderBy('timestamp', 'desc'));
    onSnapshot(storeSalesQuery, (snapshot) => {
        storeSalesData = snapshot.docs.map(doc => ({
            id: doc.id,
            source: 'store',
            ...doc.data()
        }));
        mergeSalesData();
    });

    // 3. Subscribe to Online Orders
    const onlineOrdersQuery = query(collection(db, 'onlineOrders'), orderBy('createdAt', 'desc'));
    onSnapshot(onlineOrdersQuery, (snapshot) => {
        onlineOrdersData = snapshot.docs.map(doc => ({
            id: doc.id,
            source: 'online',
            ...doc.data()
        }));
        mergeSalesData();
    });
};

const mergeSalesData = () => {
    // Normalize and merge
    const normalizedStoreSales = storeSalesData.map(sale => ({
        ...sale,
        total: sale.total || 0,
        timestamp: sale.timestamp
    }));

    const normalizedOnlineOrders = onlineOrdersData.map(order => ({
        ...order,
        total: order.totalPrice || 0,
        timestamp: order.createdAt
    }));

    allSales = [...normalizedStoreSales, ...normalizedOnlineOrders];
    
    // Sort by timestamp desc
    allSales.sort((a, b) => {
        const dateA = new Date(a.timestamp?.toDate ? a.timestamp.toDate() : a.timestamp);
        const dateB = new Date(b.timestamp?.toDate ? b.timestamp.toDate() : b.timestamp);
        return dateB - dateA;
    });

    calculateFinancials();
};

const handleAddExpense = async (e) => {
    e.preventDefault();
    
    const category = document.getElementById('expense-category').value;
    const amount = parseFloat(document.getElementById('expense-amount').value);
    const date = document.getElementById('expense-date').value;
    const description = document.getElementById('expense-description').value;

    if (!amount || !date) return;

    const submitBtn = expenseForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerText;
    submitBtn.disabled = true;
    submitBtn.innerText = "Adding...";

    try {
        await addDoc(collection(db, 'expenses'), {
            category,
            amount,
            date,
            description,
            createdAt: new Date().toISOString()
        });

        expenseForm.reset();
        document.getElementById('expense-date').valueAsDate = new Date(); // Reset date to today
        
        // Show success feedback (simple alert for now, could be toast)
        // alert('Expense added successfully!'); 
    } catch (error) {
        console.error("Error adding expense:", error);
        alert("Failed to add expense. See console for details.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = originalText;
    }
};

window.deleteExpense = async (id) => {
    if (confirm('Are you sure you want to delete this expense?')) {
        try {
            await deleteDoc(doc(db, 'expenses', id));
        } catch (error) {
            console.error("Error deleting expense:", error);
        }
    }
};

const renderExpenses = () => {
    const filteredExpenses = filterDataByDate(allExpenses, 'date');
    
    if (filteredExpenses.length === 0) {
        expensesTableBody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-8 text-gray-500">
                    No expenses found for this period.
                </td>
            </tr>
        `;
        return;
    }

    expensesTableBody.innerHTML = filteredExpenses.map(expense => `
        <tr class="border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
            <td class="py-3 pl-2 text-gray-300">${formatDate(expense.date)}</td>
            <td class="py-3">
                <span class="px-2 py-1 rounded text-xs font-medium bg-gray-700 text-gray-300">
                    ${expense.category}
                </span>
            </td>
            <td class="py-3 text-gray-400">${expense.description || '-'}</td>
            <td class="py-3 text-right pr-2 font-mono text-red-400">-€${expense.amount.toFixed(2)}</td>
            <td class="py-3 text-right">
                <button onclick="deleteExpense('${expense.id}')" class="text-gray-500 hover:text-red-500 transition-colors p-1">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </td>
        </tr>
    `).join('');
};

const calculateFinancials = () => {
    // Filter data based on current selection (Month vs All Time)
    const filteredExpenses = filterDataByDate(allExpenses, 'date');
    
    // For sales, we need to check the timestamp format. 
    // store-sales.html uses 'timestamp' which is likely a Firestore Timestamp or ISO string.
    // We'll assume ISO string or similar for now, but might need adjustment.
    const filteredSales = filterDataByDate(allSales, 'timestamp');

    const totalExpenses = filteredExpenses.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    
    // Calculate Revenue
    // Assuming sales documents have a 'total' or 'price' field. 
    // Looking at store-sales.html, it seems to calculate total on the fly or save it.
    // Let's assume 'total' or 'finalPrice' exists. If not, we might need to sum items.
    // Checking store-sales.html again... it saves `total` in the doc.
    const totalRevenue = filteredSales.reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0);

    const netProfit = totalRevenue - totalExpenses;

    // Update UI
    animateValue(totalRevenueEl, totalRevenue);
    animateValue(totalExpensesEl, totalExpenses);
    
    netProfitEl.textContent = `€${netProfit.toFixed(2)}`;
    if (netProfit >= 0) {
        netProfitEl.classList.remove('text-red-500');
        netProfitEl.classList.add('text-green-400');
    } else {
        netProfitEl.classList.remove('text-green-400');
        netProfitEl.classList.add('text-red-500');
    }
};

// Helper: Filter array by date field
const filterDataByDate = (data, dateField) => {
    if (currentFilter === 'all') return data;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return data.filter(item => {
        if (!item[dateField]) return false;
        
        // Handle Firestore Timestamp if necessary (has .toDate())
        let itemDate;
        if (item[dateField].toDate) {
            itemDate = item[dateField].toDate();
        } else {
            itemDate = new Date(item[dateField]);
        }

        return itemDate.getMonth() === currentMonth && itemDate.getFullYear() === currentYear;
    });
};

// Helper: Format date string
const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

// Helper: Animate number counting
const animateValue = (element, end) => {
    const start = parseFloat(element.textContent.replace('€', '').replace(',', '')) || 0;
    if (start === end) return;

    const duration = 500;
    const startTime = performance.now();

    const update = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Ease out quart
        const ease = 1 - Math.pow(1 - progress, 4);
        
        const current = start + (end - start) * ease;
        element.textContent = `€${current.toFixed(2)}`;

        if (progress < 1) {
            requestAnimationFrame(update);
        }
    };

    requestAnimationFrame(update);
};

// Start the app
init();
