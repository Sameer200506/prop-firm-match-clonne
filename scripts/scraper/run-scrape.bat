@echo off
rem Scheduled entry point for the PropFirm scraper.
rem Task Scheduler calls this file; it switches to the project drive+folder
rem (the path contains a space, so it is quoted) and runs the scrape.
rem `call npm` is required because npm is a .cmd shim — without `call`
rem the batch file would terminate before npm finishes.
cd /d "c:\Users\moham\Desktop\prop firm match clonne"
call npm run scrape
