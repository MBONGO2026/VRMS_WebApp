# VRMS Web App — SwiftDrive Vehicle Rentals

Interface web (formulaires + rapports) pour la base de données `swiftdrive_vrms` que tu as déjà créée et testée dans pgAdmin. Cette application ne remplace pas la base — elle se connecte simplement à ta base PostgreSQL existante et appelle les mêmes tables, vues, triggers et procédures stockées que tu as déjà validés (01_schema.sql → 09_reports_and_queries.sql).

Testée de bout en bout (client → réservation → assignation de véhicule → retour → facture → paiement) avant livraison.

**Bilingue FR / EN** : les boutons **FR / EN** en haut à droite changent la langue de toute l'interface (menus, formulaires, statuts, dates, montants). Le choix est mémorisé (cookie du navigateur) — pas besoin de le refaire à chaque page.

## Installation (Windows)

1. **Installe Node.js** (si ce n'est pas déjà fait) : https://nodejs.org (version LTS).
2. Décompresse ce dossier `vrms_webapp` quelque part, par exemple `C:\vrms_webapp`.
3. Ouvre une invite de commande (PowerShell ou CMD) dans ce dossier, puis installe les dépendances :
   ```
   npm install
   ```
4. Copie `.env.example` vers `.env` :
   ```
   copy .env.example .env
   ```
5. Ouvre `.env` avec le Bloc-notes et remplace `your_postgres_password_here` par le mot de passe que tu utilises pour te connecter à `swiftdrive_vrms` dans pgAdmin (le même que pour l'utilisateur `postgres`). Vérifie aussi `PGPORT` (5432 par défaut) si tu utilises un port différent.
6. Assure-toi que ta base `swiftdrive_vrms` existe déjà et que les 9 scripts SQL (01 à 09) y ont été exécutés — c'est elle que l'appli va utiliser telle quelle, sans rien recréer.

## Lancer l'application

```
npm start
```

Puis ouvre ton navigateur sur **http://localhost:3000**

Pour arrêter : `Ctrl+C` dans l'invite de commande.

## Ce que l'application couvre

| Section | Ce qu'elle fait | Objet SQL appelé |
|---|---|---|
| Tableau de bord | Vue d'ensemble : réservations du jour, utilisation de la flotte, retards, solde impayé | vw_TodaysBookings, vw_FleetUtilization, vw_OverdueReturns, vw_RevenueByVehicleType |
| Clients | Liste + formulaire d'enregistrement (individuel ou entreprise) | Customer, IndividualCustomer, CorporateCustomer |
| Véhicules | Disponibilité en temps réel par catégorie/agence | vw_VehicleAvailability |
| Réservations | Créer une réservation, l'annuler, l'assigner à un véhicule disponible | Booking, booking_ref_seq |
| → Confirmer | Assigne un véhicule et un employé, ouvre le contrat | **sp_confirm_booking** (règles métier : anti double-booking, dépôt obligatoire) |
| Contrats | Liste des contrats, traiter un retour | **sp_process_return** (met à jour véhicule/réservation automatiquement) |
| → Facture | Générer la facture, voir le détail, enregistrer un paiement | **sp_generate_invoice**, Payment |
| Rapports | Les 4 rapports requis + réservations par catégorie + soldes impayés | Les 8 vues de 04_views.sql |
| → Export Excel BI | Bouton **Exporter en Excel** : classeur avec onglet *Tableau de bord* (cartes KPI + 4 graphiques Excel natifs) et un tableau Excel filtrable par rapport (`/reports/export.xlsx`) | Mêmes vues que la page Rapports |

Toutes les règles métier (anti double-booking, dépôt client, mise à jour automatique du statut véhicule, pénalité de retard) sont celles que tu as déjà testées dans `06_business_rule_demo.sql` — l'application ne fait qu'appeler les mêmes procédures et triggers ; si une règle est violée, le message d'erreur exact renvoyé par PostgreSQL s'affiche dans le formulaire.

## Dépannage

- **"connection refused" / "ECONNREFUSED"** : le serveur PostgreSQL n'est pas démarré, ou `.env` pointe vers le mauvais port/hôte.
- **"password authentication failed"** : le mot de passe dans `.env` ne correspond pas à celui de l'utilisateur PostgreSQL indiqué (`PGUSER`).
- **"database swiftdrive_vrms does not exist"** : crée-la d'abord et exécute les 9 scripts SQL comme indiqué dans le rapport de soumission.
- Une erreur de contrainte (ex. *"violates check constraint"*) qui s'affiche dans un formulaire n'est pas un bug de l'application — c'est la base de données qui applique une règle d'intégrité (voir le rapport, Section 5 et 7).
