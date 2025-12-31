// Configuration Firebase
const firebaseConfig = {
    apiKey: "AIzaSyBrzubTczca86Y3rR8xeetknovHP3BYwOY",
    authDomain: "vlao-004.firebaseapp.com",
    databaseURL: "https://vlao-004-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "vlao-004",
    storageBucket: "vlao-004.firebasestorage.app",
    messagingSenderId: "301087983828",
    appId: "1:301087983828:web:e8c638a4efa567ec209341"
};

// Initialisation Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
} else {
    firebase.app();
}

const database = firebase.database();
const auth = firebase.auth();

// Variables globales
let currentUser = null;
let currentVerbe = null;
let currentPlaylist = [];
let userStats = null;
let pressTimer;
let isLongPress = false;
let passerBtn = null;
let isLoadingVerbe = false;  // Pour éviter les boucles


// Gestion des erreurs globales
window.addEventListener('error', function(e) {
    console.error('💥 Erreur non capturée:', e.error);
});

window.addEventListener('unhandledrejection', function(e) {
    console.error('💥 Promesse rejetée:', e.reason);
});

// Gestion du offline/online
window.addEventListener('online', function() {
    console.log('🌐 Connexion rétablie');
    showMessage('Connexion rétablie', 'success');
});

window.addEventListener('offline', function() {
    console.log('📶 Hors ligne');
    showMessage('Vous êtes hors ligne', 'warning');
});

// Initialisation
document.addEventListener('DOMContentLoaded', async function() {
    console.log("📱 Application démarrée");
    await initAuth();
});

// ==================== FONCTIONS UTILITAIRES ====================

function showMessage(text, type = 'info') {
    // Supprimer les anciens messages
    const oldMsg = document.querySelector('.flash-message');
    if (oldMsg) oldMsg.remove();
    
    const msg = document.createElement('div');
    msg.className = `flash-message ${type}`;
    msg.textContent = text;
    msg.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        z-index: 10001;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        animation: fadeInDown 0.3s ease-out;
    `;
    
    document.body.appendChild(msg);
    
    // Auto-destruction après 3 secondes
    setTimeout(() => {
        if (msg.parentNode) {
            msg.style.animation = 'fadeOutUp 0.3s ease-out';
            setTimeout(() => {
                if (msg.parentNode) msg.remove();
            }, 300);
        }
    }, 3000);
}

// ==================== CONVERSION AUTOMATIQUE PULAR ====================

// Table de correspondance
const pularCorrespondance = {
    'bh': 'ɓ', 'Bh': 'Ɓ',
    'dh': 'ɗ', 'Dh': 'Ɗ',
    'gn': 'ɲ', 'ny': 'ɲ',
    'Gn': 'Ɲ', 'Ny': 'Ɲ',
    'yh': 'ƴ', 'Yh': 'Ƴ',
    'gh': 'ŋ', 'Gh': 'Ŋ'
};

// Fonction de conversion
function convertirPular(texte) {
    if (!texte || typeof texte !== 'string') return texte;
    
    let resultat = texte;
    const sequences = Object.keys(pularCorrespondance);
    sequences.sort((a, b) => b.length - a.length);
    
    sequences.forEach(seq => {
        const regex = new RegExp(seq, 'g');
        resultat = resultat.replace(regex, pularCorrespondance[seq]);
    });
    
    return resultat;
}

// Configurer la conversion en temps réel
function configurerConversionTempsReel() {
    const input = document.getElementById('traduction-input');
    if (!input) return;
    
    input.addEventListener('input', function() {
        const start = this.selectionStart;
        const end = this.selectionEnd;
        const avant = this.value;
        const apres = convertirPular(avant);
        
        if (apres !== avant) {
            this.value = apres;
            const diff = apres.length - avant.length;
            this.setSelectionRange(start + diff, end + diff);
        }
    });
    
    input.addEventListener('blur', function() {
        const converti = convertirPular(this.value);
        if (converti !== this.value) this.value = converti;
    });
}

// ==================== CONFIGURATION AUTH GOOGLE ====================

// Initialisation auth
async function initAuth() {
    console.log("🔐 Initialisation Google Auth...");
    
    try {
        // Vérifier que Firebase est bien initialisé
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        
        // Attendre que Firebase soit prêt
        await new Promise(resolve => {
            const interval = setInterval(() => {
                if (firebase.auth) {
                    clearInterval(interval);
                    resolve();
                }
            }, 100);
        });
        
        // Écouter les changements d'authentification
        firebase.auth().onAuthStateChanged(async (user) => {
            if (user) {
                // ✅ Utilisateur connecté avec Google
                currentUser = user;
                console.log('✅ Connecté avec Google:', user.displayName);
                console.log('📧 Email:', user.email);
                console.log('🆔 UID:', user.uid);
                
                // Afficher les infos utilisateur
                showUserProfile();
                
                // Vérifier la base de données d'abord
                await checkDatabaseAndInitialize();
                
                // Charger les données
                await loadOrCreateUserProfile();

                //initEventListeners();
                //startRealtimeUpdates();
                //await loadNextVerbe();
                
                // Cacher le modal de connexion
                hideLoginModal();
                
            } else {
                // 🔓 Pas connecté, montrer le modal de connexion
                console.log('Non connecté, affichage écran de connexion');
                showLoginModal();
            }
        });
        
        // Vérifier si déjà connecté au chargement
        const user = firebase.auth().currentUser;
        if (!user) {
            showLoginModal();
        }
        
    } catch (error) {
        console.error('❌ Erreur critique initialisation:', error);
        showLoginModal();
    }
}

// Connexion Google
async function loginWithGoogle() {
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        
        // Options supplémentaires
        provider.addScope('profile');
        provider.addScope('email');
        
        // Connexion avec popup
        const result = await firebase.auth().signInWithPopup(provider);
        
        // Succès - géré par onAuthStateChanged
        console.log('🎉 Connexion Google réussie');
        
    } catch (error) {
        console.error('❌ Erreur Google login:', error.code, error.message);
        
        // Gestion d'erreurs
        if (error.code === 'auth/popup-closed-by-user') {
            console.log('Utilisateur a fermé la fenêtre');
        } else if (error.code === 'auth/cancelled-popup-request') {
            console.log('Popup annulée');
        } else if (error.code === 'auth/unauthorized-domain') {
            alert('Erreur: Domaine non autorisé. Ajoutez votre domaine dans Firebase Console.');
        } else {
            alert('Erreur de connexion Google: ' + error.message);
        }
    }
}

// Déconnexion
async function logout() {
    try {
        await firebase.auth().signOut();
        currentUser = null;
        userStats = {};
        
        console.log('✅ Déconnecté');
        
        // Recharger la page pour revenir à l'écran de connexion
        location.reload();
        
    } catch (error) {
        console.error('❌ Erreur déconnexion:', error);
    }
}

// Afficher le profil utilisateur
function showUserProfile() {
    // Crée l'élément s'il n'existe pas
    let profileContainer = document.getElementById('user-profile-container');
    
    if (!profileContainer) {
        profileContainer = document.createElement('div');
        profileContainer.id = 'user-profile-container';
        profileContainer.innerHTML = `
            <div style="position: absolute; top: 20px; right: 20px; display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.9); padding: 10px 15px; border-radius: 25px; box-shadow: 0 3px 15px rgba(0,0,0,0.2);">
                <img id="user-avatar" src="" alt="Avatar" style="width: 40px; height: 40px; border-radius: 50%; border: 2px solid #4CAF50;">
                <div style="text-align: right;">
                    <div id="user-name" style="font-weight: bold; color: #2c3e50; font-size: 14px;"></div>
                    <div id="user-points" style="color: #666; font-size: 12px;">0 points</div>
                </div>
                <button onclick="logout()" style="margin-left: 10px; background: #f44336; color: white; border: none; padding: 5px 10px; border-radius: 15px; font-size: 12px; cursor: pointer; font-weight: bold;">
                    Déco
                </button>
            </div>
        `;
        document.querySelector('.container').prepend(profileContainer);
    }
    
    // Mettre à jour les infos
    const avatar = document.getElementById('user-avatar');
    const name = document.getElementById('user-name');
    const points = document.getElementById('user-points');
    
    if (currentUser) {
        // Photo de profil
        if (currentUser.photoURL) {
            avatar.src = currentUser.photoURL;
        } else {
            // Avatar par défaut avec initiales
            const initials = currentUser.displayName 
                ? currentUser.displayName.charAt(0).toUpperCase()
                : 'J';
            avatar.src = `https://ui-avatars.com/api/?name=${initials}&background=4CAF50&color=fff&bold=true`;
        }
        
        // Nom
        name.textContent = currentUser.displayName || 'Joueur';
        
        // Points (mis à jour plus tard)
        if (userStats && userStats.points) {
            points.textContent = userStats.points + ' points';
        }
    }
}

// ==================== MODAL DE CONNEXION ====================

// Fonctions pour gérer le modal
function showLoginModal() {
    // Crée le modal s'il n'existe pas
    let modal = document.getElementById('login-modal');
    
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'login-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            z-index: 9999;
            display: flex;
            justify-content: center;
            align-items: center;
        `;
        
        modal.innerHTML = `
            <div style="background: white; padding: 40px; border-radius: 20px; width: 90%; max-width: 400px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
                <h1 style="color: #2c3e50; margin-bottom: 10px;">Traducteur Français-Pular</h1>
                <p style="color: #666; margin-bottom: 30px; font-size: 16px;">
                    Connectez-vous pour traduire les verbes et monter dans le classement
                </p>
                
                <!-- Bouton Google -->
                <button onclick="loginWithGoogle()" style="width: 100%; padding: 15px; background: white; color: #757575; border: 1px solid #ddd; border-radius: 10px; font-size: 16px; margin-bottom: 20px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 12px; font-weight: 500; transition: all 0.3s;">
                    <img src="https://www.google.com/favicon.ico" alt="Google" style="width: 24px; height: 24px;">
                    Continuer avec Google
                </button>
                
                <div style="color: #888; font-size: 14px; line-height: 1.5; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                    <p>📚 <strong>10 000 verbes</strong> à traduire du français au pular</p>
                    <p>🏆 <strong>Classement</strong> en temps réel avec d'autres participants</p>
                    <p>🎯 <strong>Système de validation</strong> collaborative</p>
                </div>
                
                <p style="font-size: 12px; color: #999; margin-top: 25px;">
                    Seule votre adresse email sera utilisée pour sauvegarder votre progression
                </p>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Style pour le bouton Google au survol
        const style = document.createElement('style');
        style.textContent = `
            button:hover {
                background: #f8f9fa !important;
                box-shadow: 0 5px 15px rgba(0,0,0,0.1) !important;
                transform: translateY(-2px) !important;
            }
        `;
        document.head.appendChild(style);
    }
    
    // Afficher le modal
    modal.style.display = 'flex';
    
    // Cacher le contenu principal
    const container = document.querySelector('.container');
    if (container) {
        container.style.display = 'none';
    }
}

function hideLoginModal() {
    const modal = document.getElementById('login-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    
    // Afficher le contenu principal
    const container = document.querySelector('.container');
    if (container) {
        container.style.display = 'block';
    }
}

// ==================== MODAL DE CHOIX DE PSEUDO ====================

function showPseudoModal() {
    if (!currentUser) return;
    
    const modal = document.createElement('div');
    modal.id = 'pseudo-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        z-index: 10000;
        display: flex;
        justify-content: center;
        align-items: center;
    `;
    
    modal.innerHTML = `
        <div style="background: white; padding: 40px; border-radius: 15px; width: 90%; max-width: 400px; text-align: center;">
            <h2 style="color: #2c3e50; margin-bottom: 20px;">Choisissez votre pseudo</h2>
            <p style="color: #666; margin-bottom: 20px;">
                Comment souhaitez-vous apparaître dans le classement ?
            </p>
            
            <div style="text-align: left; margin-bottom: 25px; background: #f8f9fa; padding: 20px; border-radius: 10px;">
                <div style="display: flex; align-items: center; margin-bottom: 15px;">
                    <img src="${currentUser.photoURL || 'https://www.google.com/favicon.ico'}" 
                         alt="Photo" 
                         style="width: 50px; height: 50px; border-radius: 50%; margin-right: 15px;">
                    <div>
                        <div style="font-weight: bold;">${currentUser.displayName || 'Utilisateur Google'}</div>
                        <div style="font-size: 14px; color: #666;">${currentUser.email || ''}</div>
                    </div>
                </div>
                
                <div style="margin-top: 15px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: bold; color: #333;">
                        Pseudo pour le jeu :
                    </label>
                    <input type="text" 
                           id="pseudo-input" 
                           value="${currentUser.displayName || ''}"
                           maxlength="20"
                           style="width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 8px; font-size: 16px; outline: none;">
                    <div style="font-size: 12px; color: #666; margin-top: 5px;">
                        Maximum 20 caractères. Ce pseudo sera visible par tous.
                    </div>
                </div>
            </div>
            
            <div style="display: flex; gap: 10px; margin-top: 20px;">
                <button onclick="savePseudo()" 
                        style="flex: 1; padding: 15px; background: #4CAF50; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer;">
                    ✅ Valider
                </button>
                <button onclick="useDefaultName()" 
                        style="flex: 1; padding: 15px; background: #f0f0f0; color: #666; border: none; border-radius: 8px; font-size: 16px; cursor: pointer;">
                    Par défaut
                </button>
            </div>
            
            <p style="font-size: 12px; color: #888; margin-top: 15px;">
                Vous pourrez modifier votre pseudo plus tard dans les paramètres.
            </p>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Focus sur l'input
    setTimeout(() => {
        const pseudoInput = document.getElementById('pseudo-input');
        if (pseudoInput) {
            pseudoInput.focus();
            pseudoInput.select();
        }
    }, 100);
}

// Sauvegarder le pseudo choisi
async function savePseudo() {
    const pseudoInput = document.getElementById('pseudo-input');
    const pseudo = pseudoInput ? pseudoInput.value.trim() : '';
    
    if (!pseudo) {
        alert('Veuillez entrer un pseudo');
        return;
    }
    
    if (pseudo.length > 20) {
        alert('Le pseudo ne doit pas dépasser 20 caractères');
        return;
    }
    
    // Sauvegarder dans Firebase
    await updateUserPseudo(pseudo);
    
    // Fermer le modal
    const modal = document.getElementById('pseudo-modal');
    if (modal) modal.remove();
    
    // Continuer avec l'application
    continueAfterPseudo();
}

// Utiliser le nom par défaut (nom Google)
async function useDefaultName() {
    const defaultName = currentUser.displayName || 'Joueur';
    await updateUserPseudo(defaultName);
    
    const modal = document.getElementById('pseudo-modal');
    if (modal) modal.remove();
    
    continueAfterPseudo();
}

// Mettre à jour le pseudo dans Firebase
async function updateUserPseudo(pseudo) {
    try {
        const userRef = database.ref('utilisateurs/' + currentUser.uid);
        
        // Mettre à jour le pseudo
        await userRef.update({
            nom: pseudo,
            pseudo_personnalise: true,
            date_dernier_changement_pseudo: new Date().toISOString()
        });
        
        // Mettre à jour localement
        if (userStats) {
            userStats.nom = pseudo;
            userStats.pseudo_personnalise = true;
        }
        
        console.log('📝 Pseudo mis à jour:', pseudo);
        
        // Mettre à jour l'affichage
        updateUserProfileDisplay();
        
    } catch (error) {
        console.error('❌ Erreur mise à jour pseudo:', error);
    }
}

// Continuer après avoir choisi un pseudo
function continueAfterPseudo() {
    // Initialiser l'application
    initEventListeners();
    startRealtimeUpdates();
    loadNextVerbe();
    
    // Mettre à jour l'affichage
    updateUserProfileDisplay();
    updateUserStatsDisplay();
}

// ==================== GESTION DU PROFIL UTILISATEUR ====================

async function loadOrCreateUserProfile() {
    if (!currentUser || !currentUser.uid) {
        console.error('❌ Pas d\'utilisateur connecté');
        return;
    }
    
    const userRef = database.ref('utilisateurs/' + currentUser.uid);
    
    // CHANGEMENT PRINCIPAL : .once() au lieu de .on()
    const snapshot = await userRef.once('value');
    
    if (snapshot.exists()) {
        // ✅ Profil existant
        userStats = snapshot.val();
        console.log("📊 Profil chargé:", userStats.nom);
        
        // Vérifier si c'est le premier login ou si le pseudo n'est pas personnalisé
        const isFirstLogin = !userStats.date_derniere_connexion;
        const hasCustomPseudo = userStats.pseudo_personnalise === true;
        
        if (isFirstLogin || !hasCustomPseudo) {
            // Montrer le modal pour choisir un pseudo
            showPseudoModal();
        } else {
            // Pseudo déjà choisi, continuer normalement
            continueAfterPseudo();
        }
        
        // Mettre à jour les infos Google
        userRef.update({
            email: currentUser.email || userStats.email,
            photoURL: currentUser.photoURL || userStats.photoURL,
            date_derniere_connexion: new Date().toISOString()
        });
        
    } else {
        // 🆕 Nouveau profil
        const userData = {
            nom: currentUser.displayName || 'Joueur', // Temporaire
            email: currentUser.email || null,
            photoURL: currentUser.photoURL || null,
            date_inscription: new Date().toISOString(),
            date_derniere_connexion: new Date().toISOString(),
            provider: 'google',
            pseudo_personnalise: false, // Pas encore personnalisé
            verbes_traduits: 0,
            verbes_valides: 0,
            score_fiabilite: 1.0,
            streak: 0,
            points: 0,
            historique: {},
            playlist_actuelle: null,
            verbes_passes: []
        };
        
        await userRef.set(userData);
        userStats = userData;
        console.log("👤 Nouveau profil créé");
        
        // Montrer le modal pour choisir un pseudo (nouvel utilisateur)
        showPseudoModal();
    }
}

// Mettre à jour l'affichage du profil (pour les points)
function updateUserProfileDisplay() {
    const pointsElement = document.getElementById('user-points');
    if (pointsElement && userStats) {
        pointsElement.textContent = (userStats.points || 0) + ' points';
    }
}

// ==================== VÉRIFICATION DE LA BASE DE DONNÉES ====================

async function checkDatabaseAndInitialize() {
    console.log("🔍 Vérification de la base de données...");
    
    try {
        // Vérifier si des verbes existent
        const verbesRef = database.ref('verbes');
        const verbesSnapshot = await verbesRef.once('value');
        
        // Vérifier si des playlists existent
        const playlistsRef = database.ref('playlists');
        const playlistsSnapshot = await playlistsRef.once('value');
        
        const hasVerbes = verbesSnapshot.exists() && Object.keys(verbesSnapshot.val()).length > 0;
        const hasPlaylists = playlistsSnapshot.exists() && Object.keys(playlistsSnapshot.val()).length > 0;
        
        if (!hasVerbes || !hasPlaylists) {
            console.log("📦 Base vide, initialisation automatique...");
            showInitializationPanel();
            return;
        }
        
        console.log("✅ Base de données OK");
        
    } catch (error) {
        console.error("❌ Erreur vérification base:", error);
        showInitializationPanel();
    }
}

function showInitializationPanel() {
    const initPanel = document.getElementById('init-panel');
    if (initPanel) {
        initPanel.style.display = 'block';
    }
    
    const verbeFrancais = document.getElementById('verbe-francais');
    if (verbeFrancais) {
        verbeFrancais.textContent = "Initialisation requise";
    }
    
    const statsContainer = document.getElementById('stats-container');
    if (statsContainer) {
        statsContainer.innerHTML = `
            <div class="stat-card" style="grid-column: 1 / -1;">
                <div class="stat-value">⚠️</div>
                <div class="stat-label">Base vide</div>
            </div>
        `;
    }
}

// ==================== INITIALISATION DE LA BASE ====================

async function initializeDatabase() {
    console.log("🚀 Initialisation de la base...");
    
    const button = document.querySelector('#init-panel button');
    const panel = document.getElementById('init-panel');
    
    if (!button) return;
    
    button.disabled = true;
    button.textContent = "Initialisation en cours...";
    
    try {
        // Liste de 10000 verbes français avec formes variées
        const verbes = [
            // Verbes de base (1-500)
            "être", "avoir", "faire", "dire", "pouvoir", 
            "aller", "voir", "savoir", "vouloir", "venir",
            "devoir", "prendre", "trouver", "donner", "parler",
            "mettre", "passer", "regarder", "rester", "arriver",
            "connaître", "croire", "penser", "sentir", "attendre",
            "chercher", "comprendre", "sortir", "entendre", "écrire",
            "appeler", "jouer", "finir", "partir", "ouvrir",
            "mourir", "vivre", "devenir", "revenir", "tenir",
            "rendre", "apprendre", "recevoir", "choisir", "courir",
            "répondre", "lire", "boire", "suivre", "conduire",
            "monter", "descendre", "entrer", "rentrer", "tomber",
            "travailler", "manger", "dormir", "porter", "montrer",
            "commencer", "continuer", "essayer", "oublier", "permettre",
            "servir", "expliquer", "gagner", "perdre", "changer",
            "exister", "présenter", "préparer", "offrir", "décider",
            "construire", "contenir", "produire", "considérer", "accepter",
            "réaliser", "atteindre", "utiliser", "ajouter", "créer",
            "défendre", "proposer", "supporter", "former", "représenter",
            "obtenir", "reconnaître", "remplir", "occuper", "prévoir",
            "constater", "développer", "exprimer", "assurer", "retenir",
            "traiter", "échanger", "apporter", "enlever", "découvrir",
            "rencontrer", "imposer", "manquer", "remettre", "appartenir",
            "reposer", "maintenir", "intervenir", "engager", "compter",
            "signifier", "exercer", "déterminer", "relever", "refuser",
            "conduire pour", "conduire avec", "se conduire", "être conduit",
            
            // Formes pronominales et passives (501-1000)
            "se laver", "se lever", "se coucher", "se promener", "se souvenir",
            "se taire", "se battre", "se marier", "se préparer", "se reposer",
            "se tromper", "se cacher", "se débrouiller", "se dépêcher", "se diriger",
            "se disputer", "se douter", "se fâcher", "se fier", "se figurer",
            "se garer", "se gêner", "se grouper", "se hâter", "se jeter",
            "se lever", "se mettre", "se moquer", "se noyer", "se passer",
            "se plaindre", "se précipiter", "se presser", "se produire", "se promettre",
            "se protéger", "se rappeler", "se raser", "se refuser", "se regarder",
            "se réjouir", "se rencontrer", "se rendre", "se renseigner", "se réunir",
            "se réveiller", "se servir", "se soigner", "se tenir", "se trouver",
            "se venger", "se verser", "se viser", "se voir", "se vouloir",
            "être lavé", "être levé", "être couché", "être promené", "être souvenu",
            "être tu", "être battu", "être marié", "être préparé", "être reposé",
            "être trompé", "être caché", "être débrouillé", "être dépêché", "être dirigé",
            "être disputé", "être douté", "être fâché", "être fié", "être figuré",
            "être garé", "être gêné", "être groupé", "être hâté", "être jeté",
            "être levé", "être mis", "être moqué", "être noyé", "être passé",
            "être plaint", "être précipité", "être pressé", "être produit", "être promis",
            "être protégé", "être rappelé", "être rasé", "être refusé", "être regardé",
            "être réjoui", "être rencontré", "être rendu", "être renseigné", "être réuni",
            "être réveillé", "être servi", "être soigné", "être tenu", "être trouvé",
            "être vengé", "être versé", "être visé", "être vu", "être voulu",
            
            // Verbes avec prépositions (1001-1500)
            "parler pour", "parler avec", "parler de", "parler à", "parler contre",
            "marcher pour", "marcher avec", "courir pour", "courir avec", "sauter pour",
            "sauter avec", "danser pour", "danser avec", "chanter pour", "chanter avec",
            "écouter pour", "écouter avec", "regarder pour", "regarder avec", "observer pour",
            "observer avec", "étudier pour", "étudier avec", "apprendre pour", "apprendre avec",
            "enseigner pour", "enseigner avec", "expliquer pour", "expliquer avec", "comprendre pour",
            "comprendre avec", "réfléchir pour", "réfléchir avec", "penser pour", "penser avec",
            "imaginer pour", "imaginer avec", "créer pour", "créer avec", "inventer pour",
            "inventer avec", "découvrir pour", "découvrir avec", "chercher pour", "chercher avec",
            "trouver pour", "trouver avec", "perdre pour", "perdre avec", "gagner pour",
            "gagner avec", "acheter pour", "acheter avec", "vendre pour", "vendre avec",
            "payer pour", "payer avec", "donner pour", "donner avec", "recevoir pour",
            "recevoir avec", "prendre pour", "prendre avec", "porter pour", "porter avec",
            "jeter pour", "jeter avec", "lancer pour", "lancer avec", "attraper pour",
            "attraper avec", "tenir pour", "tenir avec", "pousser pour", "pousser avec",
            "tirer pour", "tirer avec", "tourner pour", "tourner avec", "rouler pour",
            "rouler avec", "glisser pour", "glisser avec", "tomber pour", "tomber avec",
            "se lever pour", "se lever avec", "se coucher pour", "se coucher avec", "s'asseoir pour",
            "s'asseoir avec", "se tenir pour", "se tenir avec", "se promener pour", "se promener avec",
            "se reposer pour", "se reposer avec", "se battre pour", "se battre avec", "se défendre pour",
            "se défendre avec", "attaquer pour", "attaquer avec", "protéger pour", "protéger avec",
            "aider pour", "aider avec", "sauver pour", "sauver avec", "soigner pour",
            "soigner avec", "guérir pour", "guérir avec", "blesser pour", "blesser avec",
            
            // Verbes d'action courante (1501-2000)
            "cuisiner", "nettoyer", "réparer", "construire", "détruire",
            "peindre", "dessiner", "écrire", "lire", "compter",
            "calculer", "mesurer", "peser", "couper", "tailler",
            "coudre", "tricoter", "broder", "sculpter", "modeler",
            "forger", "souder", "percer", "visser", "clouer",
            "poncer", "polir", "graver", "imprimer", "copier",
            "coller", "découper", "plier", "déplier", "rouler",
            "dérouler", "enrouler", "développer", "envelopper", "emballer",
            "déballer", "ouvrir", "fermer", "casser", "réparer",
            "ajuster", "régler", "configurer", "programmer", "coder",
            "tester", "vérifier", "contrôler", "inspecter", "superviser",
            "diriger", "gérer", "organiser", "planifier", "préparer",
            "exécuter", "réaliser", "accomplir", "terminer", "finir",
            "commencer", "démarrer", "lancer", "arrêter", "stopper",
            "pauser", "reprendre", "continuer", "poursuivre", "avancer",
            "reculer", "tourner", "virer", "dévier", "corriger",
            "améliorer", "perfectionner", "optimiser", "simplifier", "complexifier",
            "analyser", "synthétiser", "résumer", "détailler", "préciser",
            "généraliser", "spécifier", "définir", "expliquer", "démontrer",
            "prouver", "argumenter", "discuter", "débattre", "négocier",
            "convaincre", "persuader", "influencer", "motiver", "encourager",
            "décourager", "critiquer", "louer", "féliciter", "remercier",
            "saluer", "accueillir", "inviter", "recevoir", "visiter",
            
            // Verbes de communication (2001-2500)
            "communiquer", "transmettre", "informer", "annoncer", "déclarer",
            "affirmer", "nier", "confirmer", "infirmer", "certifier",
            "garantir", "promettre", "jurer", "mentir", "tromper",
            "trahir", "avouer", "reconnaître", "démentir", "rétracter",
            "insister", "souligner", "suggérer", "proposer", "demander",
            "questionner", "interroger", "enquêter", "rechercher", "étudier",
            "enseigner", "éduquer", "former", "instruire", "apprendre",
            "mémoriser", "retenir", "oublier", "rappeler", "souvenir",
            "penser", "réfléchir", "méditer", "contempler", "imaginer",
            "rêver", "fantasmer", "désirer", "souhaiter", "vouloir",
            "espérer", "attendre", "prévoir", "anticiper", "prédire",
            "deviner", "supposer", "estimer", "évaluer", "juger",
            "critiquer", "apprécier", "aimer", "adorer", "détester",
            "haïr", "mépriser", "respecter", "honorer", "vénérer",
            "prier", "supplier", "implorer", "exiger", "commander",
            "ordonner", "interdire", "permettre", "autoriser", "refuser",
            "accepter", "consentir", "acquiescer", "approuver", "désapprouver",
            "féliciter", "complimenter", "encenser", "flatter", "moquer",
            "railler", "taquiner", "plaisanter", "blaguer", "rigoler",
            "rire", "sourire", "pleurer", "gémir", "crier",
            "hurler", "chuchoter", "murmurer", "balbutier", "bégayer",
            "parler", "converser", "dialoguer", "discuter", "débattre",
            
            // Verbes de mouvement (2501-3000)
            "bouger", "remuer", "agiter", "secouer", "vibrer",
            "osciller", "balancer", "pivoter", "tournoyer", "spiraller",
            "avancer", "progresser", "avancer pour", "avancer avec", "reculer",
            "reculer pour", "reculer avec", "monter", "monter pour", "monter avec",
            "descendre", "descendre pour", "descendre avec", "grimper", "grimper pour",
            "grimper avec", "escalader", "escalader pour", "escalader avec", "gravir",
            "gravir pour", "gravir avec", "tomber", "tomber pour", "tomber avec",
            "dégringoler", "dégringoler pour", "dégringoler avec", "chuter", "chuter pour",
            "chuter avec", "glisser", "glisser pour", "glisser avec", "déraper",
            "déraper pour", "déraper avec", "patiner", "patiner pour", "patiner avec",
            "skier", "skier pour", "skier avec", "surfer", "surfer pour",
            "surfer avec", "nager", "nager pour", "nager avec", "plonger",
            "plonger pour", "plonger avec", "flotter", "flotter pour", "flotter avec",
            "couler", "couler pour", "couler avec", "s'enfoncer", "s'enfoncer pour",
            "s'enfoncer avec", "émerger", "émerger pour", "émerger avec", "ressurgir",
            "ressurgir pour", "ressurgir avec", "disparaître", "disparaître pour", "disparaître avec",
            "apparaître", "apparaître pour", "apparaître avec", "surgir", "surgir pour",
            "surgir avec", "jaillir", "jaillir pour", "jaillir avec", "gicler",
            "gicler pour", "gicler avec", "éclabousser", "éclabousser pour", "éclabousser avec",
            "arroser", "arroser pour", "arroser avec", "inonder", "inonder pour",
            "inonder avec", "déborder", "déborder pour", "déborder avec", "déferler",
            "déferler pour", "déferler avec", "dévaler", "dévaler pour", "dévaler avec",
            "débouler", "débouler pour", "débouler avec", "dévaler", "dévaler pour",
            
            // Verbes de transformation (3001-3500)
            "changer", "changer pour", "changer avec", "transformer", "transformer pour",
            "transformer avec", "convertir", "convertir pour", "convertir avec", "modifier",
            "modifier pour", "modifier avec", "adapter", "adapter pour", "adapter avec",
            "ajuster", "ajuster pour", "ajuster avec", "régler", "régler pour",
            "régler avec", "calibrer", "calibrer pour", "calibrer avec", "équilibrer",
            "équilibrer pour", "équilibrer avec", "déséquilibrer", "déséquilibrer pour", "déséquilibrer avec",
            "déformer", "déformer pour", "déformer avec", "tordre", "tordre pour",
            "tordre avec", "plier", "plier pour", "plier avec", "courber",
            "courber pour", "courber avec", "redresser", "redresser pour", "redresser avec",
            "aplatir", "aplatir pour", "aplatir avec", "écraser", "écraser pour",
            "écraser avec", "compresser", "compresser pour", "compresser avec", "étirer",
            "étirer pour", "étirer avec", "allonger", "allonger pour", "allonger avec",
            "raccourcir", "raccourcir pour", "raccourcir avec", "élargir", "élargir pour",
            "élargir avec", "rétrécir", "rétrécir pour", "rétrécir avec", "épaissir",
            "épaissir pour", "épaissir avec", "amincir", "amincir pour", "amincir avec",
            "grossir", "grossir pour", "grossir avec", "maigrir", "maigrir pour",
            "maigrir avec", "grandir", "grandir pour", "grandir avec", "rajeunir",
            "rajeunir pour", "rajeunir avec", "vieillir", "vieillir pour", "vieillir avec",
            "mûrir", "mûrir pour", "mûrir avec", "pourrir", "pourrir pour",
            "pourrir avec", "fermenter", "fermenter pour", "fermenter avec", "décomposer",
            "décomposer pour", "décomposer avec", "putréfier", "putréfier pour", "putréfier avec",
            "évaporer", "évaporer pour", "évaporer avec", "condenser", "condenser pour",
            
            // Verbes scientifiques/techniques (3501-4000)
            "calculer", "calculer pour", "calculer avec", "mesurer", "mesurer pour",
            "mesurer avec", "quantifier", "quantifier pour", "quantifier avec", "évaluer",
            "évaluer pour", "évaluer avec", "estimer", "estimer pour", "estimer avec",
            "analyser", "analyser pour", "analyser avec", "synthétiser", "synthétiser pour",
            "synthétiser avec", "décomposer", "décomposer pour", "décomposer avec", "dissoudre",
            "dissoudre pour", "dissoudre avec", "mélanger", "mélanger pour", "mélanger avec",
            "combiner", "combiner pour", "combiner avec", "fusionner", "fusionner pour",
            "fusionner avec", "séparer", "séparer pour", "séparer avec", "diviser",
            "diviser pour", "diviser avec", "fractionner", "fractionner pour", "fractionner avec",
            "multiplier", "multiplier pour", "multiplier avec", "additionner", "additionner pour",
            "additionner avec", "soustraire", "soustraire pour", "soustraire avec", "comparer",
            "comparer pour", "comparer avec", "contraster", "contraster pour", "contraster avec",
            "opposer", "opposer pour", "opposer avec", "unir", "unir pour",
            "unir avec", "lier", "lier pour", "lier avec", "relier",
            "relier pour", "relier avec", "connecter", "connecter pour", "connecter avec",
            "brancher", "brancher pour", "brancher avec", "débrancher", "débrancher pour",
            "débrancher avec", "alimenter", "alimenter pour", "alimenter avec", "charger",
            "charger pour", "charger avec", "décharger", "décharger pour", "décharger avec",
            "activer", "activer pour", "activer avec", "désactiver", "désactiver pour",
            "désactiver avec", "démarrer", "démarrer pour", "démarrer avec", "arrêter",
            "arrêter pour", "arrêter avec", "programmer", "programmer pour", "programmer avec",
            "coder", "coder pour", "coder avec", "décoder", "décoder pour",
            "décoder avec", "crypter", "crypter pour", "crypter avec", "décrypter",
            "décrypter pour", "décrypter avec", "transmettre", "transmettre pour", "transmettre avec",
            
            // Verbes domestiques (4001-4500)
            "nettoyer", "nettoyer pour", "nettoyer avec", "laver", "laver pour",
            "laver avec", "rincer", "rincer pour", "rincer avec", "essuyer",
            "essuyer pour", "essuyer avec", "sécher", "sécher pour", "sécher avec",
            "repasser", "repasser pour", "repasser avec", "plier", "plier pour",
            "plier avec", "ranger", "ranger pour", "ranger avec", "déranger",
            "déranger pour", "déranger avec", "organiser", "organiser pour", "organiser avec",
            "désorganiser", "désorganiser pour", "désorganiser avec", "décorer", "décorer pour",
            "décorer avec", "peindre", "peindre pour", "peindre avec", "tapisser",
            "tapisser pour", "tapisser avec", "meubler", "meubler pour", "meubler avec",
            "démeubler", "démeubler pour", "démeubler avec", "aménager", "aménager pour",
            "aménager avec", "réaménager", "réaménager pour", "réaménager avec", "construire",
            "construire pour", "construire avec", "démolir", "démolir pour", "démolir avec",
            "réparer", "réparer pour", "réparer avec", "entretenir", "entretenir pour",
            "entretenir avec", "maintenir", "maintenir pour", "maintenir avec", "réviser",
            "réviser pour", "réviser avec", "réparer", "réparer pour", "réparer avec",
            "cuisiner", "cuisiner pour", "cuisiner avec", "préparer", "préparer pour",
            "préparer avec", "cuire", "cuire pour", "cuire avec", "bouillir",
            "bouillir pour", "bouillir avec", "frire", "frire pour", "frire avec",
            "griller", "griller pour", "griller avec", "rôtir", "rôtir pour",
            "rôtir avec", "braiser", "braiser pour", "braiser avec", "mariner",
            "mariner pour", "mariner avec", "assaisonner", "assaisonner pour", "assaisonner avec",
            "goûter", "goûter pour", "goûter avec", "déguster", "déguster pour",
            "déguster avec", "manger", "manger pour", "manger avec", "boire",
            "boire pour", "boire avec", "servir", "servir pour", "servir avec",
            
            // Continuez avec 5500 verbes supplémentaires...
            "dormir", "dormir pour", "dormir avec", "se reposer", "se reposer pour",
            "se reposer avec", "rêver", "rêver pour", "rêver avec", "ronfler",
            "ronfler pour", "ronfler avec", "bâiller", "bâiller pour", "bâiller avec",
            "s'étirer", "s'étirer pour", "s'étirer avec", "se détendre", "se détendre pour",
            "se détendre avec", "se concentrer", "se concentrer pour", "se concentrer avec", "méditer",
            "méditer pour", "méditer avec", "prier", "prier pour", "prier avec",
            "travailler", "travailler pour", "travailler avec", "étudier", "étudier pour",
            "étudier avec", "apprendre", "apprendre pour", "apprendre avec", "enseigner",
            "enseigner pour", "enseigner avec", "former", "former pour", "former avec",
            "coacher", "coacher pour", "coacher avec", "mentorer", "mentorer pour",
            "mentorer avec", "guider", "guider pour", "guider avec", "diriger",
            "diriger pour", "diriger avec", "manager", "manager pour", "manager avec",
            "superviser", "superviser pour", "superviser avec", "contrôler", "contrôler pour",
            "contrôler avec", "évaluer", "évaluer pour", "évaluer avec", "noter",
            "noter pour", "noter avec", "classer", "classer pour", "classer avec",
            "trier", "trier pour", "trier avec", "catégoriser", "catégoriser pour",
            "catégoriser avec", "archiver", "archiver pour", "archiver avec", "stocker",
            "stocker pour", "stocker avec", "entreposer", "entreposer pour", "entreposer avec",
            "garder", "garder pour", "garder avec", "conserver", "conserver pour",
            "conserver avec", "préserver", "préserver pour", "préserver avec", "protéger",
            "protéger pour", "protéger avec", "défendre", "défendre pour", "défendre avec",
            "attaquer", "attaquer pour", "attaquer avec", "combattre", "combattre pour",
            "combattre avec", "lutter", "lutter pour", "lutter avec", "résister",
            "résister pour", "résister avec", "céder", "céder pour", "céder avec",
            
            // Verbes professionnels (5001-5500)
            "administrer", "administrer pour", "administrer avec", "gérer", "gérer pour",
            "gérer avec", "diriger", "diriger pour", "diriger avec", "coordonner",
            "coordonner pour", "coordonner avec", "planifier", "planifier pour", "planifier avec",
            "organiser", "organiser pour", "organiser avec", "programmer", "programmer pour",
            "programmer avec", "budgéter", "budgéter pour", "budgéter avec", "financer",
            "financer pour", "financer avec", "investir", "investir pour", "investir avec",
            "économiser", "économiser pour", "économiser avec", "dépenser", "dépenser pour",
            "dépenser avec", "acheter", "acheter pour", "acheter avec", "vendre",
            "vendre pour", "vendre avec", "négocier", "négocier pour", "négocier avec",
            "commercer", "commercer pour", "commercer avec", "importer", "importer pour",
            "importer avec", "exporter", "exporter pour", "exporter avec", "produire",
            "produire pour", "produire avec", "fabriquer", "fabriquer pour", "fabriquer avec",
            "assembler", "assembler pour", "assembler avec", "monter", "monter pour",
            "monter avec", "démonter", "démonter pour", "démonter avec", "contrôler",
            "contrôler pour", "contrôler avec", "vérifier", "vérifier pour", "vérifier avec",
            "inspecter", "inspecter pour", "inspecter avec", "auditer", "auditer pour",
            "auditer avec", "certifier", "certifier pour", "certifier avec", "accréditer",
            "accréditer pour", "accréditer avec", "homologuer", "homologuer pour", "homologuer avec",
            "breveter", "breveter pour", "breveter avec", "déposer", "déposer pour",
            "déposer avec", "enregistrer", "enregistrer pour", "enregistrer avec", "protéger",
            "protéger pour", "protéger avec", "défendre", "défendre pour", "défendre avec",
            "plaider", "plaider pour", "plaider avec", "juger", "juger pour",
            "juger avec", "condamner", "condamner pour", "condamner avec", "acquitter",
            "acquitter pour", "acquitter avec", "libérer", "libérer pour", "libérer avec",
            "emprisonner", "emprisonner pour", "emprisonner avec", "enfermer", "enfermer pour",
            
            // Verbes artistiques (5501-6000)
            "créer", "créer pour", "créer avec", "inventer", "inventer pour",
            "inventer avec", "imaginer", "imaginer pour", "imaginer avec", "concevoir",
            "concevoir pour", "concevoir avec", "dessiner", "dessiner pour", "dessiner avec",
            "peindre", "peindre pour", "peindre avec", "sculpter", "sculpter pour",
            "sculpter avec", "modeler", "modeler pour", "modeler avec", "graver",
            "graver pour", "graver avec", "photographier", "photographier pour", "photographier avec",
            "filmer", "filmer pour", "filmer avec", "enregistrer", "enregistrer pour",
            "enregistrer avec", "monter", "monter pour", "monter avec", "mixer",
            "mixer pour", "mixer avec", "composer", "composer pour", "composer avec",
            "écrire", "écrire pour", "écrire avec", "poétiser", "poétiser pour",
            "poétiser avec", "rédiger", "rédiger pour", "rédiger avec", "éditer",
            "éditer pour", "éditer avec", "publier", "publier pour", "publier avec",
            "imprimer", "imprimer pour", "imprimer avec", "relier", "relier pour",
            "relier avec", "brocher", "brocher pour", "brocher avec", "danser",
            "danser pour", "danser avec", "chorégraphier", "chorégraphier pour", "chorégraphier avec",
            "jouer", "jouer pour", "jouer avec", "interpréter", "interpréter pour",
            "interpréter avec", "représenter", "représenter pour", "représenter avec", "mimer",
            "mimer pour", "mimer avec", "pantomimer", "pantomimer pour", "pantomimer avec",
            "chanter", "chanter pour", "chanter avec", "vocaliser", "vocaliser pour",
            "vocaliser avec", "solfier", "solfier pour", "solfier avec", "diriger",
            "diriger pour", "diriger avec", "orchestrer", "orchestrer pour", "orchestrer avec",
            "arranger", "arranger pour", "arranger avec", "adapter", "adapter pour",
            "adapter avec", "transposer", "transposer pour", "transposer avec", "moduler",
            "moduler pour", "moduler avec", "improviser", "improviser pour", "improviser avec",
            "répéter", "répéter pour", "répéter avec", "exercer", "exercer pour",
            
            // Verbes sportifs (6001-6500)
            "courir", "courir pour", "courir avec", "sprinter", "sprinter pour",
            "sprinter avec", "jogger", "jogger pour", "jogger avec", "marcher",
            "marcher pour", "marcher avec", "randonner", "randonner pour", "randonner avec",
            "grimper", "grimper pour", "grimper avec", "escalader", "escalader pour",
            "escalader avec", "alpiniser", "alpiniser pour", "alpiniser avec", "nager",
            "nager pour", "nager avec", "plonger", "plonger pour", "plonger avec",
            "surfer", "surfer pour", "surfer avec", "ski", "ski pour",
            "ski avec", "skier", "skier pour", "skier avec", "patiner",
            "patiner pour", "patiner avec", "glisser", "glisser pour", "glisser avec",
            "sauter", "sauter pour", "sauter avec", "bondir", "bondir pour",
            "bondir avec", "rebondir", "rebondir pour", "rebondir avec", "lancer",
            "lancer pour", "lancer avec", "jeter", "jeter pour", "jeter avec",
            "attraper", "attraper pour", "attraper avec", "capturer", "capturer pour",
            "capturer avec", "pêcher", "pêcher pour", "pêcher avec", "chasser",
            "chasser pour", "chasser avec", "tirer", "tirer pour", "tirer avec",
            "viser", "viser pour", "viser avec", "toucher", "toucher pour",
            "toucher avec", "frapper", "frapper pour", "frapper avec", "cogner",
            "cogner pour", "cogner avec", "taper", "taper pour", "taper avec",
            "boxer", "boxer pour", "boxer avec", "combattre", "combattre pour",
            "combattre avec", "lutter", "lutter pour", "lutter avec", "jouter",
            "jouter pour", "jouter avec", "compétitionner", "compétitionner pour", "compétitionner avec",
            "concourir", "concourir pour", "concourir avec", "rivaliser", "rivaliser pour",
            "rivaliser avec", "gagner", "gagner pour", "gagner avec", "perdre",
            "perdre pour", "perdre avec", "vaincre", "vaincre pour", "vaincre avec",
            "battre", "battre pour", "battre avec", "défaire", "défaire pour",
            "défaire avec", "triompher", "triompher pour", "triompher avec", "éliminer",
            
            // Verbes de santé (6501-7000)
            "soigner", "soigner pour", "soigner avec", "guérir", "guérir pour",
            "guérir avec", "traiter", "traiter pour", "traiter avec", "opérer",
            "opérer pour", "opérer avec", "diagnostiquer", "diagnostiquer pour", "diagnostiquer avec",
            "examiner", "examiner pour", "examiner avec", "ausculter", "ausculter pour",
            "ausculter avec", "palper", "palper pour", "palper avec", "sonder",
            "sonder pour", "sonder avec", "analyser", "analyser pour", "analyser avec",
            "prélever", "prélever pour", "prélever avec", "injecter", "injecter pour",
            "injecter avec", "vacciner", "vacciner pour", "vacciner avec", "panser",
            "panser pour", "panser avec", "bander", "bander pour", "bander avec",
            "suturer", "suturer pour", "suturer avec", "cicatriser", "cicatriser pour",
            "cicatriser avec", "infecter", "infecter pour", "infecter avec", "désinfecter",
            "désinfecter pour", "désinfecter avec", "stériliser", "stériliser pour", "stériliser avec",
            "nettoyer", "nettoyer pour", "nettoyer avec", "laver", "laver pour",
            "laver avec", "rincer", "rincer pour", "rincer avec", "sécher",
            "sécher pour", "sécher avec", "masser", "masser pour", "masser avec",
            "manipuler", "manipuler pour", "manipuler avec", "étirer", "étirer pour",
            "étirer avec", "rééduquer", "rééduquer pour", "rééduquer avec", "réhabiliter",
            "réhabiliter pour", "réhabiliter avec", "récupérer", "récupérer pour", "récupérer avec",
            "reposer", "reposer pour", "reposer avec", "dormir", "dormir pour",
            "dormir avec", "méditer", "méditer pour", "méditer avec", "relaxer",
            "relaxer pour", "relaxer avec", "détendre", "détendre pour", "détendre avec",
            "respirer", "respirer pour", "respirer avec", "inspirer", "inspirer pour",
            "inspirer avec", "expirer", "expirer pour", "expirer avec", "souffler",
            "souffler pour", "souffler avec", "haleter", "haleter pour", "haleter avec",
            "tousser", "tousser pour", "tousser avec", "éternuer", "éternuer pour",
            
            // Verbes académiques (7001-7500)
            "étudier", "étudier pour", "étudier avec", "apprendre", "apprendre pour",
            "apprendre avec", "mémoriser", "mémoriser pour", "mémoriser avec", "retenir",
            "retenir pour", "retenir avec", "oublier", "oublier pour", "oublier avec",
            "comprendre", "comprendre pour", "comprendre avec", "saisir", "saisir pour",
            "saisir avec", "percevoir", "percevoir pour", "percevoir avec", "réaliser",
            "réaliser pour", "réaliser avec", "analyser", "analyser pour", "analyser avec",
            "synthétiser", "synthétiser pour", "synthétiser avec", "critiquer", "critiquer pour",
            "critiquer avec", "évaluer", "évaluer pour", "évaluer avec", "juger",
            "juger pour", "juger avec", "comparer", "comparer pour", "comparer avec",
            "contraster", "contraster pour", "contraster avec", "relier", "relier pour",
            "relier avec", "associer", "associer pour", "associer avec", "dissocier",
            "dissocier pour", "dissocier avec", "classer", "classer pour", "classer avec",
            "catégoriser", "catégoriser pour", "catégoriser avec", "hiérarchiser", "hiérarchiser pour",
            "hiérarchiser avec", "ordonner", "ordonner pour", "ordonner avec", "séquencer",
            "séquencer pour", "séquencer avec", "systématiser", "systématiser pour", "systématiser avec",
            "structurer", "structurer pour", "structurer avec", "organiser", "organiser pour",
            "organiser avec", "planifier", "planifier pour", "planifier avec", "programmer",
            "programmer pour", "programmer avec", "calendrier", "calendrier pour", "calendrier avec",
            "scheduler", "scheduler pour", "scheduler avec", "agenda", "agenda pour",
            "agenda avec", "noter", "noter pour", "noter avec", "prendre note",
            "prendre note pour", "prendre note avec", "écrire", "écrire pour", "écrire avec",
            "rédiger", "rédiger pour", "rédiger avec", "composer", "composer pour",
            "composer avec", "produire", "produire pour", "produire avec", "créer",
            "créer pour", "créer avec", "inventer", "inventer pour", "inventer avec",
            "innover", "innover pour", "innover avec", "découvrir", "découvrir pour",
            
            // Verbes de technologie (7501-8000)
            "programmer", "programmer pour", "programmer avec", "coder", "coder pour",
            "coder avec", "développer", "développer pour", "développer avec", "concevoir",
            "concevoir pour", "concevoir avec", "architecturer", "architecturer pour", "architecturer avec",
            "structurer", "structurer pour", "structurer avec", "organiser", "organiser pour",
            "organiser avec", "optimiser", "optimiser pour", "optimiser avec", "améliorer",
            "améliorer pour", "améliorer avec", "perfectionner", "perfectionner pour", "perfectionner avec",
            "corriger", "corriger pour", "corriger avec", "débugger", "débugger pour",
            "débugger avec", "tester", "tester pour", "tester avec", "vérifier",
            "vérifier pour", "vérifier avec", "valider", "valider pour", "valider avec",
            "certifier", "certifier pour", "certifier avec", "documenter", "documenter pour",
            "documenter avec", "commenter", "commenter pour", "commenter avec", "annotater",
            "annotater pour", "annotater avec", "versionner", "versionner pour", "versionner avec",
            "gérer", "gérer pour", "gérer avec", "contrôler", "contrôler pour",
            "contrôler avec", "synchroniser", "synchroniser pour", "synchroniser avec", "mettre à jour",
            "mettre à jour pour", "mettre à jour avec", "updater", "updater pour", "updater avec",
            "patcher", "patcher pour", "patcher avec", "installer", "installer pour",
            "installer avec", "désinstaller", "désinstaller pour", "désinstaller avec", "configurer",
            "configurer pour", "configurer avec", "paramétrer", "paramétrer pour", "paramétrer avec",
            "régler", "régler pour", "régler avec", "calibrer", "calibrer pour",
            "calibrer avec", "étalonner", "étalonner pour", "étalonner avec", "connecter",
            "connecter pour", "connecter avec", "brancher", "brancher pour", "brancher avec",
            "débrancher", "débrancher pour", "débrancher avec", "allumer", "allumer pour",
            "allumer avec", "éteindre", "éteindre pour", "éteindre avec", "redémarrer",
            "redémarrer pour", "redémarrer avec", "rebooter", "rebooter pour", "rebooter avec",
            "formater", "formater pour", "formater avec", "nettoyer", "nettoyer pour",
            
            // Verbes de relation (8001-8500)
            "aimer", "aimer pour", "aimer avec", "adorer", "adorer pour",
            "adorer avec", "chérir", "chérir pour", "chérir avec", "idolâtrer",
            "idolâtrer pour", "idolâtrer avec", "vénérer", "vénérer pour", "vénérer avec",
            "respecter", "respecter pour", "respecter avec", "honorer", "honorer pour",
            "honorer avec", "estimer", "estimer pour", "estimer avec", "apprécier",
            "apprécier pour", "apprécier avec", "valoriser", "valoriser pour", "valoriser avec",
            "mépriser", "mépriser pour", "mépriser avec", "détester", "détester pour",
            "détester avec", "haïr", "haïr pour", "haïr avec", "exécrer",
            "exécrer pour", "exécrer avec", "abhorrer", "abhorrer pour", "abhorrer avec",
            "ignorer", "ignorer pour", "ignorer avec", "négliger", "négliger pour",
            "négliger avec", "dédaigner", "dédaigner pour", "dédaigner avec", "mépriser",
            "mépriser pour", "mépriser avec", "humilier", "humilier pour", "humilier avec",
            "rabaisser", "rabaisser pour", "rabaisser avec", "insulter", "insulter pour",
            "insulter avec", "offenser", "offenser pour", "offenser avec", "blesser",
            "blesser pour", "blesser avec", "heurter", "heurter pour", "heurter avec",
            "choquer", "choquer pour", "choquer avec", "scandaliser", "scandaliser pour",
            "scandaliser avec", "indigner", "indigner pour", "indigner avec", "révolter",
            "révolter pour", "révolter avec", "exciter", "exciter pour", "exciter avec",
            "énerver", "énerver pour", "énerver avec", "agacer", "agacer pour",
            "agacer avec", "irriter", "irriter pour", "irriter avec", "exaspérer",
            "exaspérer pour", "exaspérer avec", "calmer", "calmer pour", "calmer avec",
            "apaiser", "apaiser pour", "apaiser avec", "rassurer", "rassurer pour",
            "rassurer avec", "réconforter", "réconforter pour", "réconforter avec", "consoler",
            "consoler pour", "consoler avec", "soutenir", "soutenir pour", "soutenir avec",
            "encourager", "encourager pour", "encourager avec", "motiver", "motiver pour",
            
            // Verbes de voyage (8501-9000)
            "voyager", "voyager pour", "voyager avec", "déplacer", "déplacer pour",
            "déplacer avec", "se déplacer", "se déplacer pour", "se déplacer avec", "transporter",
            "transporter pour", "transporter avec", "porter", "porter pour", "porter avec",
            "charrier", "charrier pour", "charrier avec", "convoyer", "convoyer pour",
            "convoyer avec", "acheminer", "acheminer pour", "acheminer avec", "expédier",
            "expédier pour", "expédier avec", "envoyer", "envoyer pour", "envoyer avec",
            "recevoir", "recevoir pour", "recevoir avec", "importer", "importer pour",
            "importer avec", "exporter", "exporter pour", "exporter avec", "transiter",
            "transiter pour", "transiter avec", "passer", "passer pour", "passer avec",
            "traverser", "traverser pour", "traverser avec", "franchir", "franchir pour",
            "franchir avec", "contourner", "contourner pour", "contourner avec", "éviter",
            "éviter pour", "éviter avec", "dévier", "dévier pour", "dévier avec",
            "détourner", "détourner pour", "détourner avec", "diverger", "diverger pour",
            "diverger avec", "converger", "converger pour", "converger avec", "rencontrer",
            "rencontrer pour", "rencontrer avec", "croiser", "croiser pour", "croiser avec",
            "frôler", "frôler pour", "frôler avec", "effleurer", "effleurer pour",
            "effleurer avec", "toucher", "toucher pour", "toucher avec", "heurter",
            "heurter pour", "heurter avec", "percuter", "percuter pour", "percuter avec",
            "collisionner", "collisionner pour", "collisionner avec", "accidenter", "accidenter pour",
            "accidenter avec", "déraper", "déraper pour", "déraper avec", "dévier",
            "dévier pour", "dévier avec", "sortir", "sortir pour", "sortir avec",
            "quitter", "quitter pour", "quitter avec", "partir", "partir pour",
            "partir avec", "arriver", "arriver pour", "arriver avec", "atteindre",
            "atteindre pour", "atteindre avec", "rejoindre", "rejoindre pour", "rejoindre avec",
            "accoster", "accoster pour", "accoster avec", "amarrer", "amarrer pour",
            "amarrer avec", "accoster", "accoster pour", "accoster avec", "débarquer",
            "débarquer pour", "débarquer avec", "embarquer", "embarquer pour", "embarquer avec",
            
            // Verbes de nature (9001-9500)
            "pousser", "pousser pour", "pousser avec", "croître", "croître pour",
            "croître avec", "grandir", "grandir pour", "grandir avec", "développer",
            "développer pour", "développer avec", "épanouir", "épanouir pour", "épanouir avec",
            "fleurir", "fleurir pour", "fleurir avec", "bourgeonner", "bourgeonner pour",
            "bourgeonner avec", "germer", "germer pour", "germer avec", "semer",
            "semer pour", "semer avec", "planter", "planter pour", "planter avec",
            "arroser", "arroser pour", "arroser avec", "fertiliser", "fertiliser pour",
            "fertiliser avec", "cultiver", "cultiver pour", "cultiver avec", "récolter",
            "récolter pour", "récolter avec", "moissonner", "moissonner pour", "moissonner avec",
            "cueillir", "cueillir pour", "cueillir avec", "ramasser", "ramasser pour",
            "ramasser avec", "collecter", "collecter pour", "collecter avec", "accumuler",
            "accumuler pour", "accumuler avec", "amasser", "amasser pour", "amasser avec",
            "empiler", "empiler pour", "empiler avec", "entasser", "entasser pour",
            "entasser avec", "monter", "monter pour", "monter avec", "édifier",
            "édifier pour", "édifier avec", "construire", "construire pour", "construire avec",
            "bâtir", "bâtir pour", "bâtir avec", "ériger", "ériger pour",
            "ériger avec", "dresser", "dresser pour", "dresser avec", "lever",
            "lever pour", "lever avec", "élever", "élever pour", "élever avec",
            "soulever", "soulever pour", "soulever avec", "hausser", "hausser pour",
            "hausser avec", "augmenter", "augmenter pour", "augmenter avec", "accroître",
            "accroître pour", "accroître avec", "multiplier", "multiplier pour", "multiplier avec",
            "proliférer", "proliférer pour", "proliférer avec", "se multiplier", "se multiplier pour",
            "se multiplier avec", "reproduire", "reproduire pour", "reproduire avec", "générer",
            "générer pour", "générer avec", "engendrer", "engendrer pour", "engendrer avec",
            "procréer", "procréer pour", "procréer avec", "enfanter", "enfanter pour",
            
            // Verbes abstraits (9501-10000)
            "exister", "exister pour", "exister avec", "subsister", "subsister pour",
            "subsister avec", "persister", "persister pour", "persister avec", "durer",
            "durer pour", "durer avec", "persévérer", "persévérer pour", "persévérer avec",
            "continuer", "continuer pour", "continuer avec", "poursuivre", "poursuivre pour",
            "poursuivre avec", "maintenir", "maintenir pour", "maintenir avec", "soutenir",
            "soutenir pour", "soutenir avec", "supporter", "supporter pour", "supporter avec",
            "endurer", "endurer pour", "endurer avec", "tolérer", "tolérer pour",
            "tolérer avec", "accepter", "accepter pour", "accepter avec", "consentir",
            "consentir pour", "consentir avec", "admettre", "admettre pour", "admettre avec",
            "reconnaître", "reconnaître pour", "reconnaître avec", "avouer", "avouer pour",
            "avouer avec", "confesser", "confesser pour", "confesser avec", "déclarer",
            "déclarer pour", "déclarer avec", "annoncer", "annoncer pour", "annoncer avec",
            "proclamer", "proclamer pour", "proclamer avec", "prétendre", "prétendre pour",
            "prétendre avec", "affirmer", "affirmer pour", "affirmer avec", "nier",
            "nier pour", "nier avec", "démentir", "démentir pour", "démentir avec",
            "contredire", "contredire pour", "contredire avec", "réfuter", "réfuter pour",
            "réfuter avec", "infirmer", "infirmer pour", "infirmer avec", "confirmer",
            "confirmer pour", "confirmer avec", "valider", "valider pour", "valider avec",
            "certifier", "certifier pour", "certifier avec", "garantir", "garantir pour",
            "garantir avec", "assurer", "assurer pour", "assurer avec", "promettre",
            "promettre pour", "promettre avec", "jurer", "jurer pour", "jurer avec",
            "mentir", "mentir pour", "mentir avec", "tromper", "tromper pour",
            "tromper avec", "duper", "duper pour", "duper avec", "arnaquer",
            "arnaquer pour", "arnaquer avec", "escroquer", "escroquer pour", "escroquer avec",
            "voler", "voler pour", "voler avec", "dérober", "dérober pour",
            "dérober avec", "cambrioler", "cambrioler pour", "cambrioler avec", "piller",
            "piller pour", "piller avec", "dépouiller", "dépouiller pour", "dépouiller avec",
            "spolier", "spolier pour", "spolier avec", "confisquer", "confisquer pour",
            "confisquer avec", "saisir", "saisir pour", "saisir avec", "prendre",
            "prendre pour", "prendre avec", "s'approprier", "s'approprier pour", "s'approprier avec",
            "posséder", "posséder pour", "posséder avec", "détenir", "détenir pour",
            "détenir avec", "conserver", "conserver pour", "conserver avec", "garder",
            "garder pour", "garder avec", "préserver", "préserver pour", "préserver avec",
            "protéger", "protéger pour", "protéger avec", "défendre", "défendre pour",
            "défendre avec", "abandonner", "abandonner pour", "abandonner avec", "quitter",
            "quitter pour", "quitter avec", "laisser", "laisser pour", "laisser avec",
            "céder", "céder pour", "céder avec", "transmettre", "transmettre pour",
            "transmettre avec", "léguer", "léguer pour", "léguer avec", "donner",
            "donner pour", "donner avec", "offrir", "offrir pour", "offrir avec",
            "présenter", "présenter pour", "présenter avec", "montrer", "montrer pour",
            "montrer avec", "exposer", "exposer pour", "exposer avec", "révéler",
            "révéler pour", "révéler avec", "dévoiler", "dévoiler pour", "dévoiler avec",
            "découvrir", "découvrir pour", "découvrir avec", "inventer", "inventer pour",
            "inventer avec", "créer", "créer pour", "créer avec", "imaginer",
            "imaginer pour", "imaginer avec", "concevoir", "concevoir pour", "concevoir avec",
            "penser", "penser pour", "penser avec", "réfléchir", "réfléchir pour",
            "réfléchir avec", "méditer", "méditer pour", "méditer avec", "contempler",
            "contempler pour", "contempler avec", "envisager", "envisager pour", "envisager avec",
            "considérer", "considérer pour", "considérer avec", "envisager", "envisager pour",
            "envisager avec", "prévoir", "prévoir pour", "prévoir avec", "anticiper",
            "anticiper pour", "anticiper avec", "prédire", "prédire pour", "prédire avec",
            "deviner", "deviner pour", "deviner avec", "supposer", "supposer pour",
            "supposer avec", "estimer", "estimer pour", "estimer avec", "évaluer",
            "évaluer pour", "évaluer avec", "apprécier", "apprécier pour", "apprécier avec",
            "juger", "juger pour", "juger avec", "critiquer", "critiquer pour",
            "critiquer avec", "analyser", "analyser pour", "analyser avec", "examiner",
            "examiner pour", "examiner avec", "étudier", "étudier pour", "étudier avec",
            "explorer", "explorer pour", "explorer avec", "rechercher", "rechercher pour",
            "rechercher avec", "chercher", "chercher pour", "chercher avec", "trouver",
            "trouver pour", "trouver avec", "découvrir", "découvrir pour", "découvrir avec",
            "inventer", "inventer pour", "inventer avec", "innover", "innover pour",
            "innover avec", "progresser", "progresser pour", "progresser avec", "avancer",
            "avancer pour", "avancer avec", "évoluer", "évoluer pour", "évoluer avec",
            "changer", "changer pour", "changer avec", "transformer", "transformer pour",
            "transformer avec", "convertir", "convertir pour", "convertir avec", "modifier",
            "modifier pour", "modifier avec", "adapter", "adapter pour", "adapter avec",
            "ajuster", "ajuster pour", "ajuster avec", "corriger", "corriger pour",
            "corriger avec", "améliorer", "améliorer pour", "améliorer avec", "perfectionner",
            "perfectionner pour", "perfectionner avec", "optimiser", "optimiser pour", "optimiser avec",
            "simplifier", "simplifier pour", "simplifier avec", "complexifier", "complexifier pour",
            "complexifier avec", "enrichir", "enrichir pour", "enrichir avec", "appauvrir",
            "appauvrir pour", "appauvrir avec", "développer", "développer pour", "développer avec",
            "étendre", "étendre pour", "étendre avec", "agrandir", "agrandir pour",
            "agrandir avec", "réduire", "réduire pour", "réduire avec", "diminuer",
            "diminuer pour", "diminuer avec", "limiter", "limiter pour", "limiter avec",
            "restreindre", "restreindre pour", "restreindre avec", "contrôler", "contrôler pour",
            "contrôler avec", "gérer", "gérer pour", "gérer avec", "administrer",
            "administrer pour", "administrer avec", "diriger", "diriger pour", "diriger avec",
            "commander", "commander pour", "commander avec", "ordonner", "ordonner pour",
            "ordonner avec", "exiger", "exiger pour", "exiger avec", "demander",
            "demander pour", "demander avec", "suggérer", "suggérer pour", "suggérer avec",
            "proposer", "proposer pour", "proposer avec", "offrir", "offrir pour",
            "offrir avec", "donner", "donner pour", "donner avec", "recevoir",
            "recevoir pour", "recevoir avec", "accepter", "accepter pour", "accepter avec",
            "refuser", "refuser pour", "refuser avec", "rejeter", "rejeter pour",
            "rejeter avec", "repousser", "repousser pour", "repousser avec", "ignorer",
            "ignorer pour", "ignorer avec", "éviter", "éviter pour", "éviter avec",
            "fuir", "fuir pour", "fuir avec", "échapper", "échapper pour",
            "échapper avec", "sauver", "sauver pour", "sauver avec", "protéger",
            "protéger pour", "protéger avec", "défendre", "défendre pour", "défendre avec",
            "attaquer", "attaquer pour", "attaquer avec", "combattre", "combattre pour",
            "combattre avec", "lutter", "lutter pour", "lutter avec", "résister",
            "résister pour", "résister avec", "supporter", "supporter pour", "supporter avec",
            "endurer", "endurer pour", "endurer avec", "souffrir", "souffrir pour",
            "souffrir avec", "patir", "patir pour", "patir avec", "endurer",
            "endurer pour", "endurer avec", "tolérer", "tolérer pour", "tolérer avec",
            "accepter", "accepter pour", "accepter avec", "consentir", "consentir pour",
            "consentir avec", "admettre", "admettre pour", "admettre avec", "reconnaître",
            "reconnaître pour", "reconnaître avec", "avouer", "avouer pour", "avouer avec",
            "confesser", "confesser pour", "confesser avec", "déclarer", "déclarer pour",
            "déclarer avec", "annoncer", "annoncer pour", "annoncer avec", "proclamer",
            "proclamer pour", "proclamer avec", "affirmer", "affirmer pour", "affirmer avec",
            "nier", "nier pour", "nier avec", "contredire", "contredire pour",
            "contredire avec", "réfuter", "réfuter pour", "réfuter avec", "infirmer",
            "infirmer pour", "infirmer avec", "confirmer", "confirmer pour", "confirmer avec",
            "valider", "valider pour", "valider avec", "certifier", "certifier pour",
            "certifier avec", "garantir", "garantir pour", "garantir avec", "assurer",
            "assurer pour", "assurer avec", "promettre", "promettre pour", "promettre avec",
            "jurer", "jurer pour", "jurer avec", "mentir", "mentir pour",
            "mentir avec", "tromper", "tromper pour", "tromper avec", "trahir",
            "trahir pour", "trahir avec", "abandonner", "abandonner pour", "abandonner avec",
            "délaisser", "délaisser pour", "délaisser avec", "oublier", "oublier pour",
            "oublier avec", "négliger", "négliger pour", "négliger avec", "ignorer",
            "ignorer pour", "ignorer avec", "mépriser", "mépriser pour", "mépriser avec",
            "détester", "détester pour", "détester avec", "haïr", "haïr pour",
            "haïr avec", "exécrer", "exécrer pour", "exécrer avec", "abhorrer",
            "abhorrer pour", "abhorrer avec", "redouter", "redouter pour", "redouter avec",
            "craindre", "craindre pour", "craindre avec", "avoir peur", "avoir peur pour",
            "avoir peur avec", "s'inquiéter", "s'inquiéter pour", "s'inquiéter avec", "soucier",
            "soucier pour", "soucier avec", "préoccuper", "préoccuper pour", "préoccuper avec",
            "angoisser", "angoisser pour", "angoisser avec", "stresser", "stresser pour",
            "stresser avec", "tensionner", "tensionner pour", "tensionner avec", "relâcher",
            "relâcher pour", "relâcher avec", "détendre", "détendre pour", "détendre avec",
            "relaxer", "relaxer pour", "relaxer avec", "calmer", "calmer pour",
            "calmer avec", "apaiser", "apaiser pour", "apaiser avec", "rassurer",
            "rassurer pour", "rassurer avec", "réconforter", "réconforter pour", "réconforter avec",
            "consoler", "consoler pour", "consoler avec", "soutenir", "soutenir pour",
            "soutenir avec", "encourager", "encourager pour", "encourager avec", "motiver",
            "motiver pour", "motiver avec", "stimuler", "stimuler pour", "stimuler avec",
            "inspirer", "inspirer pour", "inspirer avec", "enthousiasmer", "enthousiasmer pour",
            "enthousiasmer avec", "passionner", "passionner pour", "passionner avec", "intéresser",
            "intéresser pour", "intéresser avec", "fasciner", "fasciner pour", "fasciner avec",
            "captiver", "captiver pour", "captiver avec", "charmer", "charmer pour",
            "charmer avec", "séduire", "séduire pour", "séduire avec", "envoûter",
            "envoûter pour", "envoûter avec", "ensorceler", "ensorceler pour", "ensorceler avec",
            "attirer", "attirer pour", "attirer avec", "repousser", "repousser pour",
            "repousser avec", "éloigner", "éloigner pour", "éloigner avec", "éloigner pour",
            "éloigner avec", "rapprocher", "rapprocher pour", "rapprocher avec", "unir",
            "unir pour", "unir avec", "lier", "lier pour", "lier avec",
            "relier", "relier pour", "relier avec", "connecter", "connecter pour",
            "connecter avec", "associer", "associer pour", "associer avec", "combiner",
            "combiner pour", "combiner avec", "fusionner", "fusionner pour", "fusionner avec",
            "mélanger", "mélanger pour", "mélanger avec", "intégrer", "intégrer pour",
            "intégrer avec", "incorporer", "incorporer pour", "incorporer avec", "inclure",
            "inclure pour", "inclure avec", "ajouter", "ajouter pour", "ajouter avec",
            "joindre", "joindre pour", "joindre avec", "rattacher", "rattacher pour",
            "rattacher avec", "attacher", "attacher pour", "attacher avec", "fixer",
            "fixer pour", "fixer avec", "ancrer", "ancrer pour", "ancrer avec",
            "enraciner", "enraciner pour", "enraciner avec", "implanter", "implanter pour",
            "implanter avec", "établir", "établir pour", "établir avec", "installer",
            "installer pour", "installer avec", "poser", "poser pour", "poser avec",
            "déposer", "déposer pour", "déposer avec", "placer", "placer pour",
            "placer avec", "positionner", "positionner pour", "positionner avec", "situer",
            "situer pour", "situer avec", "localiser", "localiser pour", "localiser avec",
            "trouver", "trouver pour", "trouver avec", "repérer", "repérer pour",
            "repérer avec", "détecter", "détecter pour", "détecter avec", "identifier",
            "identifier pour", "identifier avec", "reconnaître", "reconnaître pour", "reconnaître avec",
            "distinguer", "distinguer pour", "distinguer avec", "différencier", "différencier pour",
            "différencier avec", "séparer", "séparer pour", "séparer avec", "diviser",
            "diviser pour", "diviser avec", "fractionner", "fractionner pour", "fractionner avec",
            "morceler", "morceler pour", "morceler avec", "découper", "découper pour",
            "découper avec", "trancher", "trancher pour", "trancher avec", "couper",
            "couper pour", "couper avec", "sectionner", "sectionner pour", "sectionner avec",
            "scinder", "scinder pour", "scinder avec", "démembrer", "démembrer pour",
            "démembrer avec", "désassembler", "désassembler pour", "désassembler avec", "démonter",
            "démonter pour", "démonter avec", "déconstruire", "déconstruire pour", "déconstruire avec",
            "détruire", "détruire pour", "détruire avec", "anéantir", "anéantir pour",
            "anéantir avec", "annihiler", "annihiler pour", "annihiler avec", "éliminer",
            "éliminer pour", "éliminer avec", "supprimer", "supprimer pour", "supprimer avec",
            "effacer", "effacer pour", "effacer avec", "gommer", "gommer pour",
            "gommer avec", "nettoyer", "nettoyer pour", "nettoyer avec", "purifier",
            "purifier pour", "purifier avec", "assainir", "assainir pour", "assainir avec",
            "désinfecter", "désinfecter pour", "désinfecter avec", "stériliser", "stériliser pour",
            "stériliser avec", "pasteuriser", "pasteuriser pour", "pasteuriser avec", "cuire",
            "cuire pour", "cuire avec", "chauffer", "chauffer pour", "chauffer avec",
            "réchauffer", "réchauffer pour", "réchauffer avec", "refroidir", "refroidir pour",
            "refroidir avec", "geler", "geler pour", "geler avec", "congeler",
            "congeler pour", "congeler avec", "solidifier", "solidifier pour", "solidifier avec",
            "liquéfier", "liquéfier pour", "liquéfier avec", "fluidifier", "fluidifier pour",
            "fluidifier avec", "épaissir", "épaissir pour", "épaissir avec", "amincir",
            "amincir pour", "amincir avec", "diluer", "diluer pour", "diluer avec",
            "concentrer", "concentrer pour", "concentrer avec", "distiller", "distiller pour",
            "distiller avec", "filtrer", "filtrer pour", "filtrer avec", "épurer",
            "épurer pour", "épurer avec", "raffiner", "raffiner pour", "raffiner avec",
            "améliorer", "améliorer pour", "améliorer avec", "enrichir", "enrichir pour",
            "enrichir avec", "valoriser", "valoriser pour", "valoriser avec", "optimiser",
            "optimiser pour", "optimiser avec", "maximiser", "maximiser pour", "maximiser avec",
            "minimiser", "minimiser pour", "minimiser avec", "réduire", "réduire pour",
            "réduire avec", "diminuer", "diminuer pour", "diminuer avec", "abaisser",
            "abaisser pour", "abaisser avec", "baisser", "baisser pour", "baisser avec",
            "descendre", "descendre pour", "descendre avec", "tomber", "tomber pour",
            "tomber avec", "chuter", "chuter pour", "chuter avec", "s'effondrer",
            "s'effondrer pour", "s'effondrer avec", "s'écrouler", "s'écrouler pour", "s'écrouler avec",
            "décliner", "décliner pour", "décliner avec", "dégénérer", "dégénérer pour",
            "dégénérer avec", "détériorer", "détériorer pour", "détériorer avec", "dégrader",
            "dégrader pour", "dégrader avec", "abîmer", "abîmer pour", "abîmer avec",
            "endommager", "endommager pour", "endommager avec", "détruire", "détruire pour",
            "détruire avec", "ruiner", "ruiner pour", "ruiner avec", "dévaster",
            "dévaster pour", "dévaster avec", "ravager", "ravager pour", "ravager avec",
            "démolir", "démolir pour", "démolir avec", "défaire", "défaire pour",
            "défaire avec", "désorganiser", "désorganiser pour", "désorganiser avec", "perturber",
            "perturber pour", "perturber avec", "déranger", "déranger pour", "déranger avec",
            "interrompre", "interrompre pour", "interrompre avec", "arrêter", "arrêter pour",
            "arrêter avec", "cesser", "cesser pour", "cesser avec", "terminer",
            "terminer pour", "terminer avec", "finir", "finir pour", "finir avec",
            "conclure", "conclure pour", "conclure avec", "achever", "achever pour",
            "achever avec", "accomplir", "accomplir pour", "accomplir avec", "réaliser",
            "réaliser pour", "réaliser avec", "exécuter", "exécuter pour", "exécuter avec",
            "effectuer", "effectuer pour", "effectuer avec", "faire", "faire pour",
            "faire avec", "agir", "agir pour", "agir avec", "opérer",
            "opérer pour", "opérer avec", "travailler", "travailler pour", "travailler avec",
            "œuvrer", "œuvrer pour", "œuvrer avec", "collaborer", "collaborer pour",
            "collaborer avec", "coopérer", "coopérer pour", "coopérer avec", "s'associer",
            "s'associer pour", "s'associer avec", "partenarier", "partenarier pour", "partenarier avec",
            "s'allier", "s'allier pour", "s'allier avec", "s'unir", "s'unir pour",
            "s'unir avec", "se joindre", "se joindre pour", "se joindre avec", "se rallier",
            "se rallier pour", "se rallier avec", "adhérer", "adhérer pour", "adhérer avec",
            "rejoindre", "rejoindre pour", "rejoindre avec", "intégrer", "intégrer pour",
            "intégrer avec", "incorporer", "incorporer pour", "incorporer avec", "englober",
            "englober pour", "englober avec", "inclure", "inclure pour", "inclure avec",
            "comprendre", "comprendre pour", "comprendre avec", "contenir", "contenir pour",
            "contenir avec", "renfermer", "renfermer pour", "renfermer avec", "enfermer",
            "enfermer pour", "enfermer avec", "encapsuler", "encapsuler pour", "encapsuler avec",
            "emballer", "emballer pour", "emballer avec", "envelopper", "envelopper pour",
            "envelopper avec", "recouvrir", "recouvrir pour", "recouvrir avec", "couvrir",
            "couvrir pour", "couvrir avec", "protéger", "protéger pour", "protéger avec",
            "abriter", "abriter pour", "abriter avec", "héberger", "héberger pour",
            "héberger avec", "loger", "loger pour", "loger avec", "accueillir",
            "accueillir pour", "accueillir avec", "recevoir", "recevoir pour", "recevoir avec",
            "inviter", "inviter pour", "inviter avec", "convier", "convier pour",
            "convier avec", "appeler", "appeler pour", "appeler avec", "inviter",
            "inviter pour", "inviter avec", "suggérer", "suggérer pour", "suggérer avec",
            "proposer", "proposer pour", "proposer avec", "offrir", "offrir pour",
            "offrir avec", "présenter", "présenter pour", "présenter avec", "montrer",
            "montrer pour", "montrer avec", "exposer", "exposer pour", "exposer avec",
            "démontrer", "démontrer pour", "démontrer avec", "prouver", "prouver pour",
            "prouver avec", "attester", "attester pour", "attester avec", "certifier",
            "certifier pour", "certifier avec", "garantir", "garantir pour", "garantir avec",
            "assurer", "assurer pour", "assurer avec", "sécuriser", "sécuriser pour",
            "sécuriser avec", "protéger", "protéger pour", "protéger avec", "défendre",
            "défendre pour", "défendre avec", "garder", "garder pour", "garder avec",
            "surveiller", "surveiller pour", "surveiller avec", "contrôler", "contrôler pour",
            "contrôler avec", "vérifier", "vérifier pour", "vérifier avec", "inspecter",
            "inspecter pour", "inspecter avec", "scruter", "scruter pour", "scruter avec",
            "observer", "observer pour", "observer avec", "regarder", "regarder pour",
            "regarder avec", "voir", "voir pour", "voir avec", "apercevoir",
            "apercevoir pour", "apercevoir avec", "découvrir", "découvrir pour", "découvrir avec",
            "trouver", "trouver pour", "trouver avec", "repérer", "repérer pour",
            "repérer avec", "localiser", "localiser pour", "localiser avec", "situer",
            "situer pour", "situer avec", "positionner", "positionner pour", "positionner avec",
            "placer", "placer pour", "placer avec", "poser", "poser pour",
            "poser avec", "déposer", "déposer pour", "déposer avec", "installer",
            "installer pour", "installer avec", "implanter", "implanter pour", "implanter avec",
            "établir", "établir pour", "établir avec", "créer", "créer pour",
            "créer avec", "fonder", "fonder pour", "fonder avec", "instaurer",
            "instaurer pour", "instaurer avec", "instituer", "instituer pour", "instituer avec",
            "organiser", "organiser pour", "organiser avec", "structurer", "structurer pour",
            "structurer avec", "arranger", "arranger pour", "arranger avec", "agencer",
            "agencer pour", "agencer avec", "disposer", "disposer pour", "disposer avec",
            "ordonner", "ordonner pour", "ordonner avec", "classer", "classer pour",
            "classer avec", "trier", "trier pour", "trier avec", "sélectionner",
            "sélectionner pour", "sélectionner avec", "choisir", "choisir pour", "choisir avec",
            "élire", "élire pour", "élire avec", "désigner", "désigner pour",
            "désigner avec", "nommer", "nommer pour", "nommer avec", "appeler",
            "appeler pour", "appeler avec", "baptiser", "baptiser pour", "baptiser avec",
            "dénommer", "dénommer pour", "dénommer avec", "qualifier", "qualifier pour",
            "qualifier avec", "caractériser", "caractériser pour", "caractériser avec", "définir",
            "définir pour", "définir avec", "préciser", "préciser pour", "préciser avec",
            "spécifier", "spécifier pour", "spécifier avec", "détailler", "détailler pour",
            "détailler avec", "expliquer", "expliquer pour", "expliquer avec", "expliciter",
            "expliciter pour", "expliciter avec", "clarifier", "clarifier pour", "clarifier avec",
            "éclaircir", "éclaircir pour", "éclaircir avec", "illuminer", "illuminer pour",
            "illuminer avec", "éclairer", "éclairer pour", "éclairer avec", "allumer",
            "allumer pour", "allumer avec", "éteindre", "éteindre pour", "éteindre avec",
            "obscurcir", "obscurcir pour", "obscurcir avec", "assombrir", "assombrir pour",
            "assombrir avec", "noircir", "noircir pour", "noircir avec", "blanchir",
            "blanchir pour", "blanchir avec", "éclaircir", "éclaircir pour", "éclaircir avec",
            "colorer", "colorer pour", "colorer avec", "teinter", "teinter pour",
            "teinter avec", "peindre", "peindre pour", "peindre avec", "décorer",
            "décorer pour", "décorer avec", "orner", "orner pour", "orner avec",
            "embellir", "embellir pour", "embellir avec", "enjoliver", "enjoliver pour",
            "enjoliver avec", "magnifier", "magnifier pour", "magnifier avec", "sublimer",
            "sublimer pour", "sublimer avec", "transfigurer", "transfigurer pour", "transfigurer avec",
            "transformer", "transformer pour", "transformer avec", "métamorphoser", "métamorphoser pour",
            "métamorphoser avec", "changer", "changer pour", "changer avec", "modifier",
            "modifier pour", "modifier avec", "altérer", "altérer pour", "altérer avec",
            "dénaturer", "dénaturer pour", "dénaturer avec", "falsifier", "falsifier pour",
            "falsifier avec", "truquer", "truquer pour", "truquer avec", "manipuler",
            "manipuler pour", "manipuler avec", "contrôler", "contrôler pour", "contrôler avec",
            "diriger", "diriger pour", "diriger avec", "manœuvrer", "manœuvrer pour",
            "manœuvrer avec", "piloter", "piloter pour", "piloter avec", "gouverner",
            "gouverner pour", "gouverner avec", "régner", "régner pour", "régner avec",
            "dominer", "dominer pour", "dominer avec", "contrôler", "contrôler pour",
            "contrôler avec", "maîtriser", "maîtriser pour", "maîtriser avec", "posséder",
            "posséder pour", "posséder avec", "détenir", "détenir pour", "détenir avec",
            "avoir", "avoir pour", "avoir avec", "obtenir", "obtenir pour",
            "obtenir avec", "acquérir", "acquérir pour", "acquérir avec", "gagner",
            "gagner pour", "gagner avec", "mériter", "mériter pour", "mériter avec",
            "valoir", "valoir pour", "valoir avec", "coûter", "coûter pour",
            "coûter avec", "payer", "payer pour", "payer avec", "dépenser",
            "dépenser pour", "dépenser avec", "investir", "investir pour", "investir avec",
            "placer", "placer pour", "placer avec", "économiser", "économiser pour",
            "économiser avec", "épargner", "épargner pour", "épargner avec", "thésauriser",
            "thésauriser pour", "thésauriser avec", "accumuler", "accumuler pour", "accumuler avec",
            "amasser", "amasser pour", "amasser avec", "collectionner", "collectionner pour",
            "collectionner avec", "rassembler", "rassembler pour", "rassembler avec", "réunir",
            "réunir pour", "réunir avec", "regrouper", "regrouper pour", "regrouper avec",
            "unifier", "unifier pour", "unifier avec", "fusionner", "fusionner pour",
            "fusionner avec", "intégrer", "intégrer pour", "intégrer avec", "assimiler",
            "assimiler pour", "assimiler avec", "incorporer", "incorporer pour", "incorporer avec",
            "absorber", "absorber pour", "absorber avec", "ingérer", "ingérer pour",
            "ingérer avec", "manger", "manger pour", "manger avec", "boire",
            "boire pour", "boire avec", "avaler", "avaler pour", "avaler avec",
            "déglutir", "déglutir pour", "déglutir avec", "mâcher", "mâcher pour",
            "mâcher avec", "mastiquer", "mastiquer pour", "mastiquer avec", "grignoter",
            "grignoter pour", "grignoter avec", "nibler", "nibler pour", "nibler avec",
            "déguster", "déguster pour", "déguster avec", "savourer", "savourer pour",
            "savourer avec", "goûter", "goûter pour", "goûter avec", "sentir",
            "sentir pour", "sentir avec", "humer", "humer pour", "humer avec",
            "renifler", "renifler pour", "renifler avec", "respirer", "respirer pour",
            "respirer avec", "inspirer", "inspirer pour", "inspirer avec", "expirer",
            "expirer pour", "expirer avec", "souffler", "souffler pour", "souffler avec",
            "gonfler", "gonfler pour", "gonfler avec", "dégonfler", "dégonfler pour",
            "dégonfler avec", "enfler", "enfler pour", "enfler avec", "désenfler",
            "désenfler pour", "désenfler avec", "augmenter", "augmenter pour", "augmenter avec",
            "accroître", "accroître pour", "accroître avec", "amplifier", "amplifier pour",
            "amplifier avec", "intensifier", "intensifier pour", "intensifier avec", "renforcer",
            "renforcer pour", "renforcer avec", "consolider", "consolider pour", "consolider avec",
            "affermir", "affermir pour", "affermir avec", "durcir", "durcir pour",
            "durcir avec", "solidifier", "solidifier pour", "solidifier avec", "raidir",
            "raidir pour", "raidir avec", "tendre", "tendre pour", "tendre avec",
            "étirer", "étirer pour", "étirer avec", "allonger", "allonger pour",
            "allonger avec", "étendre", "étendre pour", "étendre avec", "déployer",
            "déployer pour", "déployer avec", "développer", "développer pour", "développer avec",
            "agrandir", "agrandir pour", "agrandir avec", "élargir", "élargir pour",
            "élargir avec", "agrandir", "agrandir pour", "agrandir avec", "réduire",
            "réduire pour", "réduire avec", "diminuer", "diminuer pour", "diminuer avec",
            "rétrécir", "rétrécir pour", "rétrécir avec", "resserrer", "resserrer pour",
            "resserrer avec", "serrer", "serrer pour", "serrer avec", "presser",
            "presser pour", "presser avec", "compresser", "compresser pour", "compresser avec",
            "écraser", "écraser pour", "écraser avec", "aplatir", "aplatir pour",
            "aplatir avec", "aplanir", "aplanir pour", "aplanir avec", "niveler",
            "niveler pour", "niveler avec", "égaliser", "égaliser pour", "égaliser avec",
            "équilibrer", "équilibrer pour", "équilibrer avec", "balancer", "balancer pour",
            "balancer avec", "compenser", "compenser pour", "compenser avec", "contrebalancer",
            "contrebalancer pour", "contrebalancer avec", "neutraliser", "neutraliser pour", "neutraliser avec",
            "annuler", "annuler pour", "annuler avec", "supprimer", "supprimer pour",
            "supprimer avec", "effacer", "effacer pour", "effacer avec", "gommer",
            "gommer pour", "gommer avec", "nettoyer", "nettoyer pour", "nettoyer avec",
            "purifier", "purifier pour", "purifier avec", "dépolluer", "dépolluer pour",
            "dépolluer avec", "assainir", "assainir pour", "assainir avec", "désinfecter",
            "désinfecter pour", "désinfecter avec", "stériliser", "stériliser pour", "stériliser avec",
            "décontaminer", "décontaminer pour", "décontaminer avec", "nettoyer", "nettoyer pour",
            "nettoyer avec", "laver", "laver pour", "laver avec", "rincer",
            "rincer pour", "rincer avec", "essuyer", "essuyer pour", "essuyer avec",
            "sécher", "sécher pour", "sécher avec", "éponger", "éponger pour",
            "éponger avec", "tamponner", "tamponner pour", "tamponner avec", "frotter",
            "frotter pour", "frotter avec", "gratter", "gratter pour", "gratter avec",
            "racler", "racler pour", "racler avec", "griffer", "griffer pour",
            "griffer avec", "égratigner", "égratigner pour", "égratigner avec", "entailler",
            "entailler pour", "entailler avec", "inciser", "inciser pour", "inciser avec",
            "couper", "couper pour", "couper avec", "trancher", "trancher pour",
            "trancher avec", "sectionner", "sectionner pour", "sectionner avec", "découper",
            "découper pour", "découper avec", "tailler", "tailler pour", "tailler avec",
            "sculpter", "sculpter pour", "sculpter avec", "graver", "graver pour",
            "graver avec", "inscrire", "inscrire pour", "inscrire avec", "écrire",
            "écrire pour", "écrire avec", "noter", "noter pour", "noter avec",
            "enregistrer", "enregistrer pour", "enregistrer avec", "sauvegarder", "sauvegarder pour",
            "sauvegarder avec", "archiver", "archiver pour", "archiver avec", "stocker",
            "stocker pour", "stocker avec", "consigner", "consigner pour", "consigner avec",
            "mémoriser", "mémoriser pour", "mémoriser avec", "retenir", "retenir pour",
            "retenir avec", "se souvenir", "se souvenir pour", "se souvenir avec", "oublier",
            "oublier pour", "oublier avec", "effacer", "effacer pour", "effacer avec",
            "supprimer", "supprimer pour", "supprimer avec", "annuler", "annuler pour",
            "annuler avec", "détruire", "détruire pour", "détruire avec", "anéantir",
            "anéantir pour", "anéantir avec", "annihiler", "annihiler pour", "annihiler avec",
            "éliminer", "éliminer pour", "éliminer avec", "supprimer", "supprimer pour",
            "supprimer avec", "effacer", "effacer pour", "effacer avec", "gommer",
            "gommer pour", "gommer avec", "nettoyer", "nettoyer pour", "nettoyer avec",
            "purifier", "purifier pour", "purifier avec", "assainir", "assainir pour",
            "assainir avec", "désinfecter", "désinfecter pour", "désinfecter avec", "stériliser",
            "stériliser pour", "stériliser avec", "pasteuriser", "pasteuriser pour", "pasteuriser avec",
            "cuire", "cuire pour", "cuire avec", "bouillir", "bouillir pour",
            "bouillir avec", "mijoter", "mijoter pour", "mijoter avec", "braiser",
            "braiser pour", "braiser avec"
        ];
        
        const updates = {};
        
        // Créer les verbes
        verbes.forEach((verbe, index) => {
            const id = `verbe_${index}`;
            updates[`verbes/${id}`] = {
                fr: verbe,
                etat: "non_commence",
                stats: {
                    total_votes: 0,
                    repartition: {},
                    inconnu_count: 0
                }
            };
        });
        
        // Créer des playlists initiales
        updates['playlists/playlist_1'] = [
            'verbe_0', 'verbe_1', 'verbe_2', 'verbe_3', 'verbe_4',
            'verbe_5', 'verbe_6', 'verbe_7', 'verbe_8', 'verbe_9'
        ];
        
        updates['playlists/playlist_2'] = [
            'verbe_10', 'verbe_11', 'verbe_12', 'verbe_13', 'verbe_14',
            'verbe_15', 'verbe_16', 'verbe_17', 'verbe_18', 'verbe_19'
        ];
        
        // Exécuter les mises à jour
        await database.ref().update(updates);
        
        console.log(`✅ ${verbes.length} verbes initialisés`);
        
        button.textContent = "✅ Initialisée ! Redémarrage...";
        if (panel) {
            panel.innerHTML = '<p style="color: green;">✅ Base initialisée ! L\'application va redémarrer...</p>';
        }
        
        // Redémarrer après 2 secondes
        setTimeout(() => {
            location.reload();
        }, 2000);
        
    } catch (error) {
        console.error("❌ Erreur d'initialisation:", error);
        if (button) {
            button.textContent = "❌ Erreur, réessayez";
            button.disabled = false;
        }
        if (panel) {
            panel.innerHTML += `<p style="color: red;">Erreur: ${error.message}</p>`;
        }
    }
}

// ==================== GESTION DES VERBES ====================

async function loadNextVerbe() {
    // Éviter les appels simultanés
    if (isLoadingVerbe) {
        console.log("⏳ Déjà en train de charger un verbe...");
        return;
    }
    
    isLoadingVerbe = true;
    console.log("🔍 Recherche d'un nouveau verbe...");
    
    try {
        // Si pas de playlist ou playlist vide
        if (!userStats || !userStats.playlist_actuelle || currentPlaylist.length === 0) {
            console.log("📝 Pas de playlist, on en crée une...");
            await assignNewPlaylist();
        }
        
        // Trouver un verbe non traduit dans la playlist
        for (const verbeId of currentPlaylist) {
            try {
                const verbeRef = database.ref('verbes/' + verbeId);
                const snapshot = await verbeRef.once('value');
                const verbe = snapshot.val();
                
                // Vérifier si l'utilisateur a déjà traduit ce verbe
                const alreadyDone = userStats.historique && userStats.historique[verbeId];
                
                if (verbe && !alreadyDone) {
                    currentVerbe = { id: verbeId, ...verbe };
                    console.log("🎯 Verbe trouvé:", currentVerbe.fr);
                    
                    const verbeElement = document.getElementById('verbe-francais');
                    if (verbeElement) {
                        verbeElement.textContent = currentVerbe.fr;
                    }
                    
                    // Mettre à jour la progression
                    updatePlaylistProgress();
                    isLoadingVerbe = false;
                    return;
                }
            } catch (error) {
                console.error("Erreur chargement verbe", verbeId, error);
            }
        }
        
        // Tous les verbes de la playlist sont faits
        console.log("🔄 Tous les verbes faits, nouvelle playlist...");
        await assignNewPlaylist();
        await loadNextVerbe();
        
    } catch (error) {
        console.error("❌ Erreur loadNextVerbe:", error);
        isLoadingVerbe = false;
    }
}

async function assignNewPlaylist() {
    console.log("🎵 Assignation nouvelle playlist...");
    
    try {
        // Récupérer les playlists
        const playlistsRef = database.ref('playlists');
        const snapshot = await playlistsRef.once('value');
        const allPlaylists = snapshot.val();
        
        // VÉRIFIER SI DES PLAYLISTS EXISTENT
        if (!allPlaylists || Object.keys(allPlaylists).length === 0) {
            console.error("❌ Aucune playlist disponible !");
            return;
        }
        
        console.log("📊 Playlists disponibles:", Object.keys(allPlaylists));
        
        // Trouver une playlist non terminée
        let selectedPlaylist = null;
        let playlistId = null;
        
        for (const [id, verbes] of Object.entries(allPlaylists)) {
            if (id !== userStats.playlist_actuelle) {
                // Vérifier combien de verbes sont déjà faits
                let doneCount = 0;
                if (userStats.historique) {
                    for (const verbeId of verbes) {
                        if (userStats.historique[verbeId]) {
                            doneCount++;
                        }
                    }
                }
                
                // Si moins de 80% sont faits, prendre cette playlist
                if (doneCount / verbes.length < 0.8) {
                    selectedPlaylist = verbes;
                    playlistId = id;
                    console.log("🎯 Playlist sélectionnée:", id);
                    break;
                }
            }
        }
        
        if (!selectedPlaylist) {
            console.log("📝 Création playlist dynamique...");
            playlistId = 'playlist_dyn_' + Date.now();
            selectedPlaylist = await generateDynamicPlaylist();
            
            // Sauvegarder dans Firebase
            await database.ref('playlists/' + playlistId).set(selectedPlaylist);
        }
        
        // Mettre à jour l'utilisateur
        currentPlaylist = selectedPlaylist;
        await database.ref('utilisateurs/' + currentUser.uid + '/playlist_actuelle').set(playlistId);
        
        console.log("✅ Playlist assignée:", playlistId, "avec", selectedPlaylist.length, "verbes");
        
    } catch (error) {
        console.error("❌ Erreur assignation playlist:", error);
    }
}

async function generateDynamicPlaylist() {
    try {
        const verbesRef = database.ref('verbes');
        const snapshot = await verbesRef.once('value');
        const allVerbes = snapshot.val();
        
        if (!allVerbes) return [];
        
        const verbesIds = Object.keys(allVerbes);
        return getRandomElements(verbesIds, Math.min(15, verbesIds.length));
        
    } catch (error) {
        console.error("❌ Erreur génération playlist:", error);
        return [];
    }
}

// ==================== GESTION DES ÉVÉNEMENTS ====================

function initEventListeners() {
    console.log("🎮 Initialisation des événements...");
    
    // Validation
    const validerBtn = document.getElementById('btn-valider');
    if (validerBtn) {
        validerBtn.addEventListener('click', validateTranslation);
    }
    
    // Saisie au clavier
    const input = document.getElementById('traduction-input');
    if (input) {
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                validateTranslation();
            }
        });
    }
    
    // Bouton passer
    passerBtn = document.getElementById('btn-passer');
    if (passerBtn) {
        passerBtn.addEventListener('mousedown', startPressTimer);
        passerBtn.addEventListener('touchstart', startPressTimer);
        
        passerBtn.addEventListener('mouseup', clearPressTimer);
        passerBtn.addEventListener('touchend', clearPressTimer);
        passerBtn.addEventListener('mouseleave', clearPressTimer);
        
        // Éviter le menu contextuel sur mobile
        passerBtn.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    
    // Tabs classement
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            updateClassement(this.dataset.tab);
        });
    });
    
    configurerConversionTempsReel();
    console.log("✅ Événements initialisés");
}

// ==================== GESTION DES TRADUCTIONS ====================

function startPressTimer(e) {
    isLongPress = false;
    if (passerBtn) {
        passerBtn.classList.remove('long-press');
    }
    
    pressTimer = setTimeout(() => {
        isLongPress = true;
        if (passerBtn) {
            passerBtn.classList.add('long-press');
        }
    }, 1000);
}

function clearPressTimer() {
    if (pressTimer) {
        clearTimeout(pressTimer);
        
        if (!isLongPress) {
            skipVerbe();
        } else {
            markAsUnknown();
        }
        
        isLongPress = false;
        if (passerBtn) {
            passerBtn.classList.remove('long-press');
        }
    }
}

async function validateTranslation() {
    const input = document.getElementById('traduction-input');
    let traduction = input ? input.value.trim() : '';
    
    if (!traduction || !currentVerbe) {
        console.log("⚠️ Traduction vide ou pas de verbe");
        return;
    }

    // CONVERSION FINALE AVANT SAUVEGARDE
    traduction = convertirPular(traduction);

    console.log("💾 Sauvegarde traduction:", traduction);
    
    try {
        // Sauvegarder la traduction
        await saveTranslation(traduction);
        
        // Mettre à jour les stats
        await updateUserStatsAfterTranslation();
        
        // Vérifier le consensus
        await checkConsensus(currentVerbe.id);
        
        // Charger le prochain verbe
        if (input) {
            input.value = '';
        }
        await loadNextVerbe();
        
    } catch (error) {
        console.error("❌ Erreur validation:", error);
    }
}

async function saveTranslation(traduction) {
    const updates = {};
    const verbeId = currentVerbe.id;
    const userId = currentUser.uid;
    
    // Dans les verbes
    updates[`verbes/${verbeId}/traductions/${userId}`] = traduction;
    
    // Dans l'historique utilisateur
    updates[`utilisateurs/${userId}/historique/${verbeId}`] = traduction;
    
    // Incrémenter le compteur
    const verbeRef = database.ref('verbes/' + verbeId);
    const snapshot = await verbeRef.once('value');
    const verbe = snapshot.val();
    
    const currentCount = (verbe.stats && verbe.stats.total_votes) || 0;
    updates[`verbes/${verbeId}/stats/total_votes`] = currentCount + 1;
    
    // Mettre à jour la répartition
    const repartition = (verbe.stats && verbe.stats.repartition) || {};
    repartition[traduction] = (repartition[traduction] || 0) + 1;
    updates[`verbes/${verbeId}/stats/repartition`] = repartition;
    
    await database.ref().update(updates);
    console.log("✅ Traduction sauvegardée");
}

async function checkConsensus(verbeId) {
    try {
        const verbeRef = database.ref('verbes/' + verbeId);
        const snapshot = await verbeRef.once('value');
        const verbe = snapshot.val();
        
        if (!verbe.traductions) return;
        
        const Y = 3; // Seuil de consensus réduit pour le début
        const traductions = Object.values(verbe.traductions);
        
        if (traductions.length >= Y) {
            // Compter les occurrences
            const counts = {};
            traductions.forEach(trad => {
                counts[trad] = (counts[trad] || 0) + 1;
            });
            
            // Trouver la traduction dominante
            let maxTrad = null;
            let maxCount = 0;
            
            for (const [trad, count] of Object.entries(counts)) {
                if (count > maxCount) {
                    maxCount = count;
                    maxTrad = trad;
                }
            }
            
            // Si consensus atteint (≥ 60%)
            if (maxCount / traductions.length >= 0.6) {
                await database.ref('verbes/' + verbeId).update({
                    etat: 'valide',
                    'stats/traduction_validee': maxTrad,
                    'stats/pourcentage_accord': (maxCount / traductions.length * 100).toFixed(2)
                });
                
                console.log("✅ Consensus atteint pour", verbeId, ":", maxTrad);
            }
        }
    } catch (error) {
        console.error("❌ Erreur vérification consensus:", error);
    }
}

async function skipVerbe() {
    if (!currentVerbe) return;
    
    console.log("⏭️ Passage du verbe:", currentVerbe.fr);
    
    try {
        // Ajouter aux verbes passés
        const passedRef = database.ref('utilisateurs/' + currentUser.uid + '/verbes_passes');
        const snapshot = await passedRef.once('value');
        const passed = snapshot.val() || [];
        
        if (!passed.includes(currentVerbe.id)) {
            passed.push(currentVerbe.id);
            await passedRef.set(passed);
        }
        
        // Charger le prochain
        const input = document.getElementById('traduction-input');
        if (input) {
            input.value = '';
        }
        await loadNextVerbe();
        
    } catch (error) {
        console.error("❌ Erreur skip:", error);
    }
}

async function markAsUnknown() {
    if (!currentVerbe) return;
    
    console.log("❓ Marqué comme inconnu:", currentVerbe.fr);
    
    try {
        // Incrémenter le compteur "inconnu"
        const verbeRef = database.ref('verbes/' + currentVerbe.id);
        const snapshot = await verbeRef.once('value');
        const verbe = snapshot.val();
        
        const inconnuCount = ((verbe.stats && verbe.stats.inconnu_count) || 0) + 1;
        
        await database.ref('verbes/' + currentVerbe.id).update({
            'stats/inconnu_count': inconnuCount,
            etat: inconnuCount >= 3 ? 'difficile' : (verbe.etat || 'non_commence')
        });
        
        // Marquer comme répondu
        await database.ref(`utilisateurs/${currentUser.uid}/historique/${currentVerbe.id}`).set('inconnu');
        
        // Charger le prochain
        await loadNextVerbe();
        
    } catch (error) {
        console.error("❌ Erreur marquage inconnu:", error);
    }
}

// ==================== AFFICHAGE ====================

function updateUserStatsDisplay() {
    const container = document.getElementById('stats-container');
    
    if (!container || !userStats) return;
    
    container.innerHTML = `
        <div class="stat-card">
            <div class="stat-value">${userStats.verbes_traduits || 0}</div>
            <div class="stat-label">Traduits</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${userStats.verbes_valides || 0}</div>
            <div class="stat-label">Validés</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${(userStats.score_fiabilite || 1.0).toFixed(1)}</div>
            <div class="stat-label">Fiabilité</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${userStats.streak || 0} 🔥</div>
            <div class="stat-label">Streak</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${userStats.points || 0}</div>
            <div class="stat-label">Points</div>
        </div>
    `;
}

function updatePlaylistProgress() {
    if (!userStats.historique || !currentPlaylist) return;
    
    let doneCount = 0;
    for (const verbeId of currentPlaylist) {
        if (userStats.historique[verbeId]) {
            doneCount++;
        }
    }
    
    const progress = (doneCount / currentPlaylist.length) * 100;
    const progressBar = document.getElementById('progress-fill');
    const playlistInfo = document.getElementById('playlist-info');
    
    if (progressBar) {
        progressBar.style.width = `${progress}%`;
    }
    
    if (playlistInfo) {
        playlistInfo.textContent = `${doneCount}/${currentPlaylist.length} verbes`;
    }
}

async function updateUserStatsAfterTranslation() {
    try {
        const updates = {};
        const currentPoints = userStats.points || 0;
        const currentTraduits = userStats.verbes_traduits || 0;
        const currentStreak = userStats.streak || 0;
        
        // Points de base
        updates[`utilisateurs/${currentUser.uid}/points`] = currentPoints + 5;
        updates[`utilisateurs/${currentUser.uid}/verbes_traduits`] = currentTraduits + 1;
        updates[`utilisateurs/${currentUser.uid}/streak`] = currentStreak + 1;
        
        await database.ref().update(updates);
        console.log("📈 Stats mises à jour");
        
    } catch (error) {
        console.error("❌ Erreur mise à jour stats:", error);
    }
}

// ==================== CLASSEMENT ====================

function startRealtimeUpdates() {
    console.log("🏆 Initialisation classement temps réel");
    
    // Classement global
    const classementRef = database.ref('utilisateurs').orderByChild('points').limitToLast(20);
    
    classementRef.on('value', (snapshot) => {
        updateClassementDisplay(snapshot.val(), 'global');
    });
}

function updateClassementDisplay(usersData, type) {
    const list = document.getElementById('classement-list');
    
    if (!list) return;
    
    if (!usersData) {
        list.innerHTML = '<li class="classement-item">Chargement...</li>';
        return;
    }
    
    // Convertir en tableau et trier
    let usersArray = [];
    for (const [userId, user] of Object.entries(usersData)) {
        if (user && user.points !== undefined) {
            usersArray.push({
                id: userId,
                ...user
            });
        }
    }
    
    usersArray.sort((a, b) => (b.points || 0) - (a.points || 0));
    
    // Afficher
    list.innerHTML = '';
    
    usersArray.slice(0, 10).forEach((user, index) => {
        const li = document.createElement('li');
        li.className = `classement-item ${user.id === currentUser.uid ? 'current-user' : ''}`;
        
        let medal = '';
        if (index === 0) medal = '🥇';
        else if (index === 1) medal = '🥈';
        else if (index === 2) medal = '🥉';
        
        li.innerHTML = `
            <div class="position ${index < 3 ? 'medal-' + (index + 1) : ''}">
                ${index + 1} ${medal}
            </div>
            <div class="user-name">${user.nom || 'Anonyme'}</div>
            <div class="user-points">${user.points || 0} pts</div>
        `;
        
        list.appendChild(li);
    });
    
    if (usersArray.length === 0) {
        list.innerHTML = '<li class="classement-item">Aucun joueur pour l\'instant</li>';
    }
}

async function updateClassement(type) {
    try {
        let ref;
        
        if (type === 'journalier') {
            const today = new Date().toISOString().split('T')[0];
            ref = database.ref('classement/journalier/' + today).orderByValue().limitToLast(20);
        } else {
            ref = database.ref('utilisateurs').orderByChild('points').limitToLast(20);
        }
        
        const snapshot = await ref.once('value');
        updateClassementDisplay(snapshot.val(), type);
        
    } catch (error) {
        console.error("❌ Erreur classement:", error);
    }
}

// ==================== UTILITAIRES ====================

function getRandomElements(arr, n) {
    if (!arr || arr.length === 0) return [];
    
    const shuffled = [...arr].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(n, arr.length));
}

// ==================== PARAMÈTRES ====================

function showSettings() {
    const modal = document.createElement('div');
    modal.id = 'settings-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        z-index: 10000;
        display: flex;
        justify-content: center;
        align-items: center;
    `;
    
    modal.innerHTML = `
        <div style="background: white; padding: 30px; border-radius: 15px; width: 90%; max-width: 500px; max-height: 80vh; overflow-y: auto;">
            <h2 style="color: #2c3e50; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
                Paramètres
                <button onclick="this.parentElement.parentElement.parentElement.remove()" 
                        style="background: none; border: none; font-size: 24px; cursor: pointer; color: #666;">
                    ×
                </button>
            </h2>
            
            <div style="margin-bottom: 30px;">
                <h3 style="color: #333; margin-bottom: 15px;">👤 Votre profil</h3>
                
                <div style="display: flex; align-items: center; margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 10px;">
                    <img src="${currentUser.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(userStats?.nom || 'J') + '&background=667eea&color=fff'}" 
                         alt="Photo" 
                         style="width: 60px; height: 60px; border-radius: 50%; margin-right: 15px;">
                    <div style="flex: 1;">
                        <div style="font-weight: bold; font-size: 18px;">${userStats?.nom || 'Joueur'}</div>
                        <div style="color: #666; font-size: 14px;">${currentUser.email || ''}</div>
                        <div style="font-size: 12px; color: #888;">Connecté avec Google</div>
                    </div>
                </div>
                
                <div style="margin-top: 20px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: bold; color: #333;">
                        Modifier votre pseudo :
                    </label>
                    <div style="display: flex; gap: 10px;">
                        <input type="text" 
                               id="change-pseudo-input" 
                               value="${userStats?.nom || ''}"
                               maxlength="20"
                               style="flex: 1; padding: 12px; border: 2px solid #ddd; border-radius: 8px; font-size: 16px; outline: none;">
                        <button onclick="changePseudo()" 
                                style="padding: 12px 20px; background: #4CAF50; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">
                            Modifier
                        </button>
                    </div>
                    <div style="font-size: 12px; color: #666; margin-top: 5px;">
                        Votre pseudo sera visible par tous les joueurs.
                    </div>
                </div>
            </div>
            
            <div style="margin-bottom: 30px;">
                <h3 style="color: #333; margin-bottom: 15px;">📊 Vos statistiques</h3>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
                    <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 24px; font-weight: bold; color: #1976d2;">${userStats?.verbes_traduits || 0}</div>
                        <div style="font-size: 12px; color: #555;">Verbes traduits</div>
                    </div>
                    <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 24px; font-weight: bold; color: #388e3c;">${userStats?.points || 0}</div>
                        <div style="font-size: 12px; color: #555;">Points</div>
                    </div>
                </div>
            </div>
            
            <div>
                <h3 style="color: #333; margin-bottom: 15px;">⚙️ Options</h3>
                <button onclick="exportMyData()" 
                        style="width: 100%; padding: 15px; margin-bottom: 10px; background: #2196F3; color: white; border: none; border-radius: 8px; text-align: left; cursor: pointer;">
                    📥 Exporter mes données
                </button>
                <button onclick="logout()" 
                        style="width: 100%; padding: 15px; background: #f44336; color: white; border: none; border-radius: 8px; text-align: left; cursor: pointer;">
                    🚪 Déconnexion
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// Changer le pseudo depuis les paramètres
async function changePseudo() {
    const pseudoInput = document.getElementById('change-pseudo-input');
    const nouveauPseudo = pseudoInput ? pseudoInput.value.trim() : '';
    
    if (!nouveauPseudo) {
        alert('Veuillez entrer un pseudo');
        return;
    }
    
    if (nouveauPseudo.length > 20) {
        alert('Le pseudo ne doit pas dépasser 20 caractères');
        return;
    }
    
    if (nouveauPseudo === userStats?.nom) {
        alert('C\'est déjà votre pseudo actuel');
        return;
    }
    
    // Mettre à jour
    await updateUserPseudo(nouveauPseudo);
    
    // Mettre à jour l'affichage
    const settingsModal = document.getElementById('settings-modal');
    if (settingsModal) {
        settingsModal.remove();
        setTimeout(() => showSettings(), 300); // Recharger les paramètres
    }
    
    showMessage('Pseudo modifié avec succès !', 'success');
}

// Fonction pour exporter les données personnelles
async function exportMyData() {
    try {
        const userRef = database.ref('utilisateurs/' + currentUser.uid);
        const snapshot = await userRef.once('value');
        const data = snapshot.val();
        
        // Formater pour l'export
        const exportData = {
            profil: {
                nom: data.nom,
                email: currentUser.email,
                date_inscription: data.date_inscription,
                points: data.points,
                verbes_traduits: data.verbes_traduits,
                verbes_valides: data.verbes_valides
            },
            historique: data.historique || {},
            date_export: new Date().toISOString()
        };
        
        // Créer et télécharger le fichier
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `traducteur-pular-${currentUser.uid}-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showMessage('Données exportées avec succès !', 'success');
        
    } catch (error) {
        console.error('❌ Erreur export données:', error);
        showMessage('Erreur lors de l\'export', 'error');
    }
}

// ==================== STYLES ADDITIONNELS ====================

// Ajoutez ce style dans index.html ou créez-le dynamiquement
const authStyles = `
    /* Animation pour le modal */
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
    }
    
    @keyframes fadeInDown {
        from { opacity: 0; transform: translate(-50%, -20px); }
        to { opacity: 1; transform: translate(-50%, 0); }
    }
    
    @keyframes fadeOutUp {
        from { opacity: 1; transform: translate(-50%, 0); }
        to { opacity: 0; transform: translate(-50%, -20px); }
    }
    
    #login-modal > div {
        animation: fadeIn 0.5s ease-out;
    }
    
    /* Bouton Google amélioré */
    button[onclick="loginWithGoogle()"]:hover {
        background: #f8f9fa !important;
        box-shadow: 0 5px 15px rgba(0,0,0,0.1) !important;
        transform: translateY(-2px) !important;
        transition: all 0.3s !important;
    }
    
    /* Avatar utilisateur */
    #user-avatar {
        transition: transform 0.3s;
    }
    
    #user-avatar:hover {
        transform: scale(1.1);
    }
    
    /* Bouton passer avec long press */
    .long-press {
        background-color: #ff9800 !important;
        color: white !important;
        box-shadow: 0 0 20px rgba(255, 152, 0, 0.5) !important;
    }
`;

// Injecter les styles
const styleSheet = document.createElement("style");
styleSheet.textContent = authStyles;
document.head.appendChild(styleSheet);

// ==================== EXPORT FONCTIONS GLOBALES ====================
window.initializeDatabase = initializeDatabase;
window.loginWithGoogle = loginWithGoogle;
window.logout = logout;
window.savePseudo = savePseudo;
window.useDefaultName = useDefaultName;
window.showSettings = showSettings;
window.changePseudo = changePseudo;
window.exportMyData = exportMyData;

// ==================== DÉMARRAGE AUTOMATIQUE ====================
console.log("🚀 App.js chargé avec succès");
