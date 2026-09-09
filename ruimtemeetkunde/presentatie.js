/* Presentatielaag voor de cursussite.
 *
 * lwarp levert de volledige cursus als een doorlopende HTML-stroom. Dit
 * script knipt die stroom clientside op in slides, een per concept, en zet er
 * navigatie, verbergbare oplossingen en bediening van de 3D-figuren omheen.
 * Er wordt niets aan de inhoud toegevoegd: alles komt uit het .tex-bestand.
 *
 * Het script draait onderaan de body, dus voor MathJax typezet. Zo hoeft
 * MathJax de knipbeurt niet ongedaan te zien maken.
 */
(function () {
  "use strict";

  // Op welke koppen begint een nieuwe slide. lwarp zet \section, \subsection
  // en \subsubsection van een article-document om in h4, h5 en h6.
  var KOPPEN = "h1, h2, h3, h4, h5, h6";
  var NIVEAU = { H1: 1, H2: 1, H3: 1, H4: 1, H5: 2, H6: 3 };

  var podium, zijbalk, sluier, teller, voortgang, voortgangbalk, hulpvenster, zoekveld, melding;
  var kopbalk, knopVorige, knopVolgende, knopOplossingen, knopHints,
      knopZijbalk, knopPresentatie;
  var slides = [];
  var navigatie = [];
  var index = 0;
  var oplossingenZichtbaar = false;
  var hintsZichtbaar = false;
  var groteFiguur = null;
  var zijbalkVoorPresentatie = false;
  var knopThema, systeemDonker;

  // Waar dit hoofdstuk zijn voorkeuren bewaart. Het pad erin houdt de
  // hoofdstukken uit elkaar wanneer ze op dezelfde server staan.
  var BEWAAR = "pres:" + location.pathname;

  /* --- Kleine hulpjes -------------------------------------------------- */

  function el(tag, klasse, tekst) {
    var e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (tekst != null) e.textContent = tekst;
    return e;
  }

  function icoon(pad) {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    var p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", pad);
    svg.appendChild(p);
    return svg;
  }

  var ICOON = {
    links: "M15 18l-6-6 6-6",
    rechts: "M9 18l6-6-6-6",
    lijst: "M4 6h16M4 12h16M4 18h16",
    oog: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 9a3 3 0 100 6 3 3 0 000-6z",
    herstel: "M3 12a9 9 0 109-9 9 9 0 00-6.36 2.64L3 8M3 3v5h5",
    begin: "M5 5v14M19 6l-9 6 9 6z",
    einde: "M19 5v14M5 6l9 6-9 6z",
    speel: "M8 5l11 7-11 7z",
    pauze: "M8 5v14M16 5v14",
    vraag: "M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3M12 17h.01",
    lamp: "M9 18h6M10 22h4M8.5 14.5a6 6 0 117 0c-1 1-1.5 2-1.5 3.5h-4c0-1.5-.5-2.5-1.5-3.5z",
    vergroot: "M8 3H5a2 2 0 00-2 2v3M16 3h3a2 2 0 012 2v3M8 21H5a2 2 0 01-2-2v-3M16 21h3a2 2 0 002-2v-3",
    zoek: "M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4.1-4.1",
    scherm: "M3 5h18v11H3zM9 20h6M12 16v4",
    zon: "M12 7a5 5 0 100 10 5 5 0 000-10M12 1v3M12 20v3M4.2 4.2l2.1 2.1" +
         "M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1",
    maan: "M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"
  };

  // Hierin gaat wat een leerling tussen twee keer kijken wil terugvinden: de
  // laatst bekeken slide en of de oplossingen open stonden. Het mag de site
  // nooit stilleggen: een browser in privémodus kan localStorage weigeren.
  function bewaar(sleutel, waarde) {
    try { localStorage.setItem(BEWAAR + ":" + sleutel, waarde); } catch (e) { /* niets */ }
  }

  function opgehaald(sleutel) {
    try { return localStorage.getItem(BEWAAR + ":" + sleutel); } catch (e) { return null; }
  }

  /* --- Hints ---------------------------------------------------------- */

  // Hints zijn een voorkeur van de lezer en gelden daarom voor alle
  // hoofdstukken, net als het thema. Zonder opgeslagen keuze blijven ze
  // verborgen; presentatie.css zorgt dat ze ook voor het starten niet even
  // zichtbaar opflitsen.
  var HINTS = "pres:hints";

  function bewaardeHints() {
    try { return localStorage.getItem(HINTS) === "1"; } catch (e) { return false; }
  }

  function huidigeSlideHeeftHints() {
    var slide = slides[index];
    return Boolean(slide &&
      (slide.querySelector(".hint") || /\\hint\s*\{/.test(slide.textContent)));
  }

  function toonHintknop() {
    if (!knopHints) return;
    var heeftHints = huidigeSlideHeeftHints();
    var actie = heeftHints
      ? (hintsZichtbaar ? "Hints verbergen" : "Hints tonen")
      : "Geen hints in dit hoofdstuk";
    knopHints.disabled = !heeftHints;
    knopHints.setAttribute("aria-pressed", String(heeftHints && hintsZichtbaar));
    knopHints.setAttribute("aria-label", actie);
    knopHints.title = actie;
    knopHints.querySelector("span").textContent = "Hints";
  }

  function zetHints(toon, onthouden) {
    hintsZichtbaar = toon;
    document.documentElement.setAttribute(
      "data-hints", toon ? "zichtbaar" : "verborgen");
    if (onthouden) {
      try { localStorage.setItem(HINTS, toon ? "1" : "0"); } catch (e) { /* niets */ }
    }
    toonHintknop();
  }

  function wisselHints() {
    zetHints(!hintsZichtbaar, true);
  }

  // Meteen toepassen, zodat de opgeslagen keuze er al staat wanneer de
  // pagina voor het eerst wordt getekend.
  zetHints(bewaardeHints(), false);

  /* --- Dag- en nachtstand ---------------------------------------------- */

  // De keuze tussen dag en nacht hangt aan de lezer, niet aan het hoofdstuk:
  // wie 's avonds in de zetel leest, wil dat in elk hoofdstuk. Daarom een
  // eigen sleutel, buiten BEWAAR om.
  var THEMA = "pres:thema";

  function bewaardThema() {
    try {
      var t = localStorage.getItem(THEMA);
      return t === "licht" || t === "donker" ? t : null;
    } catch (e) { return null; }
  }

  // Zolang er niets gekozen is, volgt de site het toestel; kiest de lezer
  // zelf, dan blijft die keuze staan. Het attribuut is altijd ingevuld, ook
  // bij de dagstand, zodat de bladwijzer maar een lijst kleuren hoeft te
  // kennen die van de standaard afwijkt.
  function zetThema(naam, onthouden) {
    document.documentElement.setAttribute("data-thema", naam);
    if (onthouden) {
      try { localStorage.setItem(THEMA, naam); } catch (e) { /* niets */ }
    }
    if (knopThema) toonThemaknop(naam);
    // De interactieve grafieken tekenen zelf; ze lezen op dit signaal de
    // kleuren opnieuw uit. De 3D-figuren hebben het niet nodig: die keert
    // presentatie.css om met een filter.
    document.dispatchEvent(new CustomEvent("pres:thema", { detail: naam }));
  }

  function huidigThema() {
    return document.documentElement.getAttribute("data-thema") === "donker"
      ? "donker" : "licht";
  }

  // De knop toont waar je naartoe gaat, niet waar je staat: overdag een maan.
  function toonThemaknop(naam) {
    var donker = naam === "donker";
    knopThema.replaceChildren(icoon(donker ? ICOON.zon : ICOON.maan));
    knopThema.title = donker
      ? "Overschakelen naar de dagstand (d)"
      : "Overschakelen naar de nachtstand (d)";
    // Bewust geen aria-pressed: de knop schakelt om, ze staat niet aan.
    knopThema.setAttribute("aria-label", knopThema.title);
  }

  function wisselThema() {
    zetThema(huidigThema() === "donker" ? "licht" : "donker", true);
  }

  // Meteen bij het inlezen, nog voor de pagina getekend wordt: anders flitst
  // er een wit blad voorbij bij wie in het donker leest.
  function beginThema() {
    systeemDonker = window.matchMedia
      ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    var gekozen = bewaardThema();
    zetThema(gekozen || (systeemDonker && systeemDonker.matches ? "donker" : "licht"), false);

    // Zet het toestel 's avonds vanzelf om, dan gaat de site mee, tenminste
    // zolang de lezer zelf niets gekozen heeft.
    if (systeemDonker && systeemDonker.addEventListener) {
      systeemDonker.addEventListener("change", function (e) {
        if (!bewaardThema()) zetThema(e.matches ? "donker" : "licht", false);
      });
    }
  }

  beginThema();

  // \(...\) is de notatie waarmee lwarp wiskunde aan MathJax doorgeeft. In
  // een venstertitel heeft die geen betekenis, dus schrapt dit de haakjes.
  function zonderWiskunde(tekst) {
    return (tekst || "").replace(/\\[()[\]]/g, "").replace(/\s+/g, " ").trim();
  }

  function slug(tekst, standaard) {
    var s = (tekst || "").toLowerCase()
      .replace(/[‘’']/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return s || standaard;
  }

  /* --- De stroom in slides knippen ------------------------------------- */

  // lwarp verpakt de tekst in <section class="textbody"> binnen <main>.
  function vindStroom() {
    return document.querySelector("section.textbody") ||
           document.querySelector("main") ||
           document.body;
  }

  function maakSlides(stroom) {
    var kinderen = Array.prototype.slice.call(stroom.children);
    var huidige = null;
    var gebruikt = Object.create(null);
    // Wat lwarp voor de eigenlijke cursus zet (de macrodefinities voor
    // MathJax) hoort in geen enkele slide thuis, maar moet wel in de pagina
    // blijven staan: MathJax leest die bij het typezetten.
    var voorwerk = el("div", "pres-voorwerk");
    voorwerk.hidden = true;

    function kopgegevens(kop) {
      var nummer = "";
      var nr = kop.querySelector(".sectionnumber");
      if (nr) nummer = nr.textContent.trim();
      var titel = Array.prototype.filter.call(kop.childNodes, function (n) {
        return !(n.classList && n.classList.contains("sectionnumber"));
      }).map(function (n) { return n.textContent; }).join("").trim();
      var naam = slug(titel, "slide");
      if (gebruikt[naam]) naam = naam + "-" + (++gebruikt[naam]);
      else gebruikt[naam] = 1;
      return {
        kop: kop,
        niveau: NIVEAU[kop.tagName] || 3,
        nummer: nummer,
        titel: titel,
        id: naam
      };
    }

    function voegNavigatieToe(s, gegevens) {
      gegevens.slide = s;
      navigatie.push(gegevens);
      if (!s.id) s.id = gegevens.id;
    }

    function nieuweSlide(kop) {
      var s = el("section", "slide");
      var titel = document.title || "Titel";
      var gegevens = null;
      if (kop) {
        gegevens = kopgegevens(kop);
        titel = gegevens.titel;
      }
      s.dataset.niveau = String(gegevens ? gegevens.niveau : 1);
      s.dataset.titel = titel;
      s.dataset.nummer = gegevens ? gegevens.nummer : "";
      if (!gegevens) {
        s.id = slug(titel, "slide");
        gebruikt[s.id] = 1;
      }
      slides.push(s);
      stroom.appendChild(s);
      if (gegevens) voegNavigatieToe(s, gegevens);
      return s;
    }

    function voegGroepToe(groep) {
      var groepskinderen = Array.prototype.slice.call(groep.children);
      var koppen = groepskinderen.filter(function (kind) {
        return kind.matches && kind.matches(KOPPEN);
      });
      if (!koppen.length) {
        if (!huidige) voorwerk.appendChild(groep);
        else huidige.appendChild(groep);
        return;
      }
      huidige = nieuweSlide(koppen[0]);
      groepskinderen.forEach(function (kind) {
        if (kind !== koppen[0] && kind.matches && kind.matches(KOPPEN)) {
          voegNavigatieToe(huidige, kopgegevens(kind));
        }
        huidige.appendChild(kind);
      });
      var titels = navigatie.filter(function (item) {
        return item.slide === huidige;
      }).map(function (item) { return item.titel; });
      huidige.dataset.titel = titels.join(" · ");
      huidige.setAttribute("aria-label", titels.join("; "));
      groep.remove();
    }

    kinderen.forEach(function (kind) {
      var kop = kind.matches && kind.matches(KOPPEN) ? kind : null;

      // Het blok van \maketitle vormt de openingsslide.
      if (kind.classList && kind.classList.contains("cursustitel")) {
        huidige = nieuweSlide(null);
        var h1 = kind.querySelector("h1");
        huidige.dataset.titel = h1 ? h1.textContent.trim() : document.title;
        huidige.dataset.titelslide = "1";
        huidige.appendChild(kind);
        navigatie.push({
          kop: h1,
          niveau: 1,
          nummer: "",
          titel: huidige.dataset.titel,
          id: huidige.id,
          slide: huidige
        });
        return;
      }

      if (kind.classList && kind.classList.contains("sameslide")) {
        voegGroepToe(kind);
        return;
      }

      if (kop) huidige = nieuweSlide(kop);
      if (!huidige) { voorwerk.appendChild(kind); return; }
      huidige.appendChild(kind);
    });

    stroom.parentNode.insertBefore(voorwerk, stroom);

    // Slides zonder zichtbare inhoud (lege ankers, restjes) weglaten.
    slides = slides.filter(function (s) {
      if (s.textContent.trim() !== "" || s.querySelector("iframe, img, svg")) return true;
      s.remove();
      return false;
    });
    navigatie.forEach(function (item) {
      item.slideIndex = slides.indexOf(item.slide);
    });
  }

  /* --- Kruimelspoor per slide ------------------------------------------ */

  function zetKruimels() {
    var pad = [];
    slides.forEach(function (s) {
      var niveau = Number(s.dataset.niveau);
      pad.length = niveau - 1;
      pad[niveau - 1] = s.dataset.titel;
      if (niveau > 1 && pad[0]) {
        var kruimel = el("p", "pres-kruimel", pad.slice(0, niveau - 1).join(" › "));
        s.insertBefore(kruimel, s.firstChild);
      }
    });
  }

  /* --- Oplossingen ------------------------------------------------------ */

  // Elke oplossing krijgt een wikkel rond haar inhoud, zodat het dichtklappen
  // de knop zelf niet meeneemt.
  function bereidOplossingenVoor() {
    document.querySelectorAll(".oplossing").forEach(function (blok) {
      var inhoud = el("div", "pres-inhoud");
      while (blok.firstChild) inhoud.appendChild(blok.firstChild);
      var knop = el("button", "pres-onthul");
      knop.type = "button";
      knop.appendChild(icoon(ICOON.oog));
      knop.appendChild(el("span", null, "Toon oplossing"));
      knop.addEventListener("click", function () {
        zetOplossing(blok, blok.classList.contains("pres-verborgen"));
      });
      blok.addEventListener("click", function (e) {
        if (e.target.closest("button, a, input, select, textarea, iframe, [role='button']")) return;
        zetOplossing(blok, blok.classList.contains("pres-verborgen"));
      });
      blok.appendChild(knop);
      blok.appendChild(inhoud);
      zetOplossing(blok, false);
    });

    // Losse invulvakjes (\opl) klappen open bij een klik. In wiskundemodus
    // levert MathJax er een <g class="opl-math"> voor af.
    document.querySelectorAll(".opl, .opl-math").forEach(function (vak) {
      vak.setAttribute("role", "button");
      vak.setAttribute("tabindex", "0");
      zetLosseOplossing(vak, false);
      function wissel() {
        zetLosseOplossing(vak, vak.classList.contains("pres-verborgen"));
      }
      vak.addEventListener("click", wissel);
      vak.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); wissel(); }
      });
    });
  }

  // MathJax typezet pas nadat dit script gedraaid heeft, dus bestaan de
  // .opl-math-groepen op dat moment nog niet. Deze waarnemer vangt ze op
  // zodra ze in de pagina verschijnen.
  function volgWiskundeOplossingen() {
    var waarnemer = new MutationObserver(function () {
      document.querySelectorAll(".opl-math:not([data-pres])").forEach(function (vak) {
        vak.dataset.pres = "1";
        zetLosseOplossing(vak, oplossingenZichtbaar);
        // De groep zelf bevat enkel de letters van het antwoord; dichtgeklapt
        // valt daar niets te raken. Vang de klik daarom op de hele formule.
        var doel = vak.closest("mjx-container") || vak;
        doel.classList.add("pres-oplformule");
        doel.addEventListener("click", function () {
          zetLosseOplossing(vak, vak.classList.contains("pres-verborgen"));
        });
      });
    });
    waarnemer.observe(document.body, { childList: true, subtree: true });
  }

  function zetOplossing(blok, toon) {
    blok.classList.toggle("pres-verborgen", !toon);
    var knop = blok.querySelector(":scope > .pres-onthul");
    if (knop) knop.lastChild.textContent = toon ? "Verberg oplossing" : "Toon oplossing";
  }

  function zetLosseOplossing(vak, toon) {
    vak.classList.toggle("pres-verborgen", !toon);
    vak.setAttribute("aria-pressed", String(toon));
    vak.setAttribute("aria-label", toon ? "Antwoord verbergen" : "Antwoord tonen");
    vak.title = toon ? "Klik om het antwoord te verbergen" : "Klik om het antwoord te tonen";
  }

  function wisselAlleOplossingen(toon) {
    oplossingenZichtbaar = toon;
    document.querySelectorAll(".oplossing").forEach(function (b) {
      zetOplossing(b, toon);
    });
    document.querySelectorAll(".opl, .opl-math").forEach(function (v) {
      zetLosseOplossing(v, toon);
    });
    knopOplossingen.setAttribute("aria-pressed", String(toon));
    bewaar("oplossingen", toon ? "1" : "0");
  }

  // Een presentatiewijzer stuurt doorgaans Page Down/Page Up of de verticale
  // pijlen. Met gesloten oplossingen gebruiken we die als tussenstappen op
  // de huidige slide; de horizontale pijlen blijven altijd slideknoppen.
  function zetOplossingselement(element, toon) {
    if (element.classList.contains("oplossing")) {
      zetOplossing(element, toon);
    } else {
      zetLosseOplossing(element, toon);
    }
  }

  function geanimeerdeFiguur(element) {
    return Array.prototype.find.call(element.querySelectorAll("iframe"), function (frame) {
      return frame._stappen && frame._stappen.aantal > 0;
    });
  }

  function stapInFiguur(element, richting) {
    if (!element || !element.classList.contains("oplossing")) return false;
    var frame = geanimeerdeFiguur(element);
    if (!frame) return false;
    var toestand = frame._stappen;
    var volgende = toestand.stap + richting;
    if (volgende < 1 || volgende > toestand.aantal) return false;
    zetFiguurstap(frame, volgende);
    return true;
  }

  function stapVooruit() {
    var elementen = slides[index].querySelectorAll(".oplossing, .opl, .opl-math");
    if (!elementen.length) {
      toon(index + 1);
      return;
    }
    var zichtbaar = Array.prototype.filter.call(elementen, function (element) {
      return !element.classList.contains("pres-verborgen");
    });
    if (stapInFiguur(zichtbaar[zichtbaar.length - 1], 1)) return;
    if (!oplossingenZichtbaar) {
      var verborgen = Array.prototype.find.call(elementen, function (element) {
        return element.classList.contains("pres-verborgen");
      });
      if (verborgen) {
        zetOplossingselement(verborgen, true);
        return;
      }
    }
    toon(index + 1);
  }

  function stapTerug() {
    var elementen = slides[index].querySelectorAll(".oplossing, .opl, .opl-math");
    if (!elementen.length) {
      toon(index - 1);
      return;
    }
    var zichtbaar = Array.prototype.filter.call(elementen, function (element) {
      return !element.classList.contains("pres-verborgen");
    });
    var huidig = zichtbaar[zichtbaar.length - 1];
    if (stapInFiguur(huidig, -1)) return;
    if (!oplossingenZichtbaar && huidig) {
      zetOplossingselement(huidig, false);
      return;
    }
    if (!huidig) toon(index - 1);
  }

  /* --- 3D-figuren ------------------------------------------------------- */

  // De iframes krijgen hun src pas wanneer hun slide in beeld komt. Browsers
  // staan maar een handvol WebGL-contexten tegelijk toe, dus een figuur die
  // uit beeld gaat, geeft de zijne weer vrij.
  function bereidFigurenVoor() {
    document.querySelectorAll("iframe").forEach(function (frame) {
      var bron = frame.getAttribute("src");
      if (!bron) return;
      frame.dataset.bron = bron;
      frame.removeAttribute("src");
      frame.removeAttribute("loading");

      var doos = el("div", "pres-figuur");
      // De breedte kwam uit \asyinclude[width=..]; de hoogte houden we, de
      // breedte laten we het slidekader vullen.
      var hoogte = (frame.style.height || "40vh");
      frame.style.cssText = "";
      frame.style.height = hoogte;
      doos.style.maxWidth = "100%";

      // Een vaste figuur bevat één SVG-afbeelding. Gebruik haar intrinsieke
      // verhouding, zodat het iframe geen cameraruimte reserveert die alleen
      // voor een draaibare WebGL-scene zin heeft. Als de inhoud niet leesbaar
      // is, blijft de hoogte uit \asyinclude als veilige terugval staan.
      if (frame.hasAttribute("data-vast")) {
        frame.addEventListener("load", function () {
          try {
            var afbeelding = frame.contentDocument.querySelector("img");
            if (afbeelding && afbeelding.naturalWidth && afbeelding.naturalHeight) {
              frame.style.aspectRatio = afbeelding.naturalWidth + " / " + afbeelding.naturalHeight;
              frame.style.height = "auto";
            }
          } catch (e) {
            /* Een niet-lokale figuur behoudt de opgegeven terugvalhoogte. */
          }
        });
      }

      frame.parentNode.insertBefore(doos, frame);
      doos.appendChild(frame);

      var balk = el("div", "pres-figuurbalk");
      // Een figuur kan in een verbergbare oplossing staan. Bedieningsklikken
      // horen uitsluitend bij de figuur en mogen die bovenliggende oplossing
      // nooit open- of dichtklappen.
      balk.addEventListener("click", function (e) { e.stopPropagation(); });

      frame._stappen = { stap: 1, aantal: 0, timer: null, knoppen: null };
      // Het iframe kan vanuit de lokale file:-site al geladen zijn voordat
      // zijn eerste melding verwerkt wordt. Deze vraag is tegelijk de
      // expliciete beginstand bij iedere nieuwe WebGL-context.
      frame.addEventListener("load", function () {
        var stap = frame._herstelStap || 1;
        frame._herstelStap = null;
        frame.contentWindow.postMessage({ type: "asy-stap", stap: stap }, "*");
      });

      // Op een beamer is een figuur van 28vh klein voor de achterste bank.
      // Deze knop legt ze over het hele podium; Escape brengt ze terug.
      var groot = el("button", "pres-knop");
      groot.classList.add("pres-figuur-grootknop");
      groot.type = "button";
      groot.title = "Deze figuur groot tonen (Escape sluit ze weer)";
      groot.setAttribute("aria-pressed", "false");
      groot.appendChild(icoon(ICOON.vergroot));
      groot.appendChild(el("span", null, "Groot"));
      groot.addEventListener("click", function () {
        zetGroteFiguur(doos, !doos.classList.contains("pres-figuur-groot"));
      });
      balk.appendChild(groot);

      // Een figuur met data-vast is een vaste tekening in plaats van een
      // WebGL-scene, dus valt er niets te herstellen.
      if (!frame.hasAttribute("data-vast")) {
        var reset = el("button", "pres-knop");
        reset.type = "button";
        reset.title = "Herstel de oorspronkelijke rotatie en zoom";
        reset.appendChild(icoon(ICOON.herstel));
        reset.appendChild(el("span", null, "Reset"));
        reset.addEventListener("click", function () { herstelFiguur(frame); });
        balk.appendChild(reset);
      }
      doos.appendChild(balk);
    });

    window.addEventListener("message", function (e) {
      var frame = Array.prototype.find.call(document.querySelectorAll("iframe"),
        function (kandidaat) { return kandidaat.contentWindow === e.source; });
      var bericht = e.data;
      if (!frame || !bericht || bericht.type !== "asy-stappen") return;
      var toestand = frame._stappen;
      toestand.stap = bericht.stap;
      toestand.aantal = bericht.aantal;
      if (toestand.timer && toestand.stap >= toestand.aantal) stopStapspel(frame);
      if (!toestand.knoppen) voegStapknoppenToe(frame);
      werkStapknoppenBij(frame);
    });
  }

  function stapknop(icoonpad, tekst, titel, actie) {
    var knop = el("button", "pres-knop pres-stapknop");
    knop.type = "button";
    knop.title = titel;
    knop.setAttribute("aria-label", titel);
    knop.appendChild(icoon(icoonpad));
    knop.appendChild(el("span", null, tekst));
    knop.addEventListener("click", actie);
    return knop;
  }

  function stopStapspel(frame) {
    var toestand = frame._stappen;
    if (toestand.timer) clearInterval(toestand.timer);
    toestand.timer = null;
  }

  function zetFiguurstap(frame, stap) {
    stopStapspel(frame);
    frame.contentWindow.postMessage({ type: "asy-stap", stap: stap }, "*");
  }

  function voegStapknoppenToe(frame) {
    var toestand = frame._stappen;
    var balk = frame.parentNode.querySelector(".pres-figuurbalk");
    var groot = balk.firstChild;
    var begin = stapknop(ICOON.begin, "Begin", "Toon de eerste constructiestap",
      function () { zetFiguurstap(frame, 1); });
    var vorige = stapknop(ICOON.links, "Vorige", "Toon de vorige constructiestap",
      function () { zetFiguurstap(frame, toestand.stap - 1); });
    var volgende = stapknop(ICOON.rechts, "Volgende", "Toon de volgende constructiestap",
      function () { zetFiguurstap(frame, toestand.stap + 1); });
    var einde = stapknop(ICOON.einde, "Einde", "Toon de volledige constructie",
      function () { zetFiguurstap(frame, toestand.aantal); });
    var speel = stapknop(ICOON.speel, "Play", "Speel de constructiestappen af", function () {
      if (toestand.timer) {
        stopStapspel(frame);
        werkStapknoppenBij(frame);
        return;
      }
      if (toestand.stap === toestand.aantal) {
        frame.contentWindow.postMessage({ type: "asy-stap", stap: 1 }, "*");
        toestand.stap = 1;
      }
      toestand.timer = setInterval(function () {
        if (toestand.stap >= toestand.aantal) {
          stopStapspel(frame);
          werkStapknoppenBij(frame);
        } else {
          frame.contentWindow.postMessage({ type: "asy-stap", stap: toestand.stap + 1 }, "*");
        }
      }, 1500);
      werkStapknoppenBij(frame);
    });
    [begin, vorige, volgende, einde, speel].forEach(function (knop) {
      balk.insertBefore(knop, groot);
    });
    toestand.knoppen = { begin: begin, vorige: vorige, volgende: volgende,
      einde: einde, speel: speel };
    // De bediening verschijnt pas wanneer de actieve WebGL-figuur meldt dat
    // ze stappen ondersteunt. Vestig dan eenmalig en zonder maatverandering
    // de aandacht op de knop waarmee de constructie afgespeeld wordt.
    speel.addEventListener("animationend", function () {
      speel.classList.remove("pres-speel-attentie");
    }, { once: true });
    requestAnimationFrame(function () {
      speel.classList.add("pres-speel-attentie");
    });
  }

  function werkStapknoppenBij(frame) {
    var toestand = frame._stappen;
    var knoppen = toestand.knoppen;
    if (!knoppen) return;
    knoppen.begin.disabled = knoppen.vorige.disabled = toestand.stap <= 1;
    knoppen.einde.disabled = knoppen.volgende.disabled = toestand.stap >= toestand.aantal;
    knoppen.speel.replaceChild(icoon(toestand.timer ? ICOON.pauze : ICOON.speel),
      knoppen.speel.firstChild);
    knoppen.speel.querySelector("span").textContent = toestand.timer ? "Pauze" : "Play";
    knoppen.speel.title = toestand.timer ? "Pauzeer de constructiestappen" :
      "Speel de constructiestappen af";
    knoppen.speel.setAttribute("aria-label", knoppen.speel.title);
    knoppen.speel.setAttribute("aria-pressed", String(Boolean(toestand.timer)));
  }

  /* --- Interactieve grafieken -------------------------------------------- */

  // Een interactieve grafiek is geen Asymptote-iframe: ze tekent in de pagina
  // zelf. Ze krijgt wel dezelfde bediening, want voor wie in de klas kijkt is
  // het gewoon weer een figuur. Groot werkt op het kader, Reset gaat als
  // gebeurtenis naar interactieve-grafieken.js, dat weet wat de beginstand is.
  function bereidGrafiekenVoor() {
    document.querySelectorAll(".interactieve-grafiek").forEach(function (fig) {
      fig.classList.add("pres-figuur");
      var balk = el("div", "pres-figuurbalk");

      var groot = el("button", "pres-knop");
      groot.type = "button";
      groot.title = "Deze grafiek groot tonen (Escape sluit ze weer)";
      groot.setAttribute("aria-pressed", "false");
      groot.appendChild(icoon(ICOON.vergroot));
      groot.appendChild(el("span", null, "Groot"));
      groot.addEventListener("click", function () {
        zetGroteFiguur(fig, !fig.classList.contains("pres-figuur-groot"));
      });
      balk.appendChild(groot);

      var reset = el("button", "pres-knop");
      reset.type = "button";
      reset.title = "Zet deze grafiek terug in haar beginstand";
      reset.appendChild(icoon(ICOON.herstel));
      reset.appendChild(el("span", null, "Reset"));
      reset.addEventListener("click", function () {
        fig.dispatchEvent(new CustomEvent("pres:herstel", { bubbles: true }));
      });
      balk.appendChild(reset);

      fig.appendChild(balk);
    });
  }

  // De figuur blijft waar ze staat; enkel haar kader gaat over het podium
  // liggen. Zo houdt het iframe zijn WebGL-context en blijft de stand van de
  // scene bewaard. Het iframe krijgt vanzelf een resize, waarop de viewer
  // zijn canvas mee laat groeien.
  function zetGroteFiguur(doos, groot) {
    if (groteFiguur && groteFiguur !== doos) zetGroteFiguur(groteFiguur, false);
    doos.classList.toggle("pres-figuur-groot", groot);
    document.body.classList.toggle("pres-figuur-open", groot);
    var knop = doos.querySelector(".pres-figuurbalk .pres-figuur-grootknop");
    if (knop) knop.setAttribute("aria-pressed", String(groot));
    groteFiguur = groot ? doos : null;
    // Een tekening in de pagina zelf moet weten hoeveel plaats ze nu heeft;
    // een iframe krijgt vanzelf een resize.
    doos.toggleAttribute("data-grafiek-groot", groot);
    doos.dispatchEvent(new CustomEvent("pres:zichtbaar", { bubbles: true }));
  }

  function activeerFiguren(slide, aan) {
    slide.querySelectorAll("iframe").forEach(function (frame) {
      if (aan) {
        if (!frame.getAttribute("src")) frame.setAttribute("src", frame.dataset.bron);
      } else if (frame.getAttribute("src")) {
        if (frame._stappen) stopStapspel(frame);
        frame.removeAttribute("src");
      }
    });
  }

  // De WebGL-viewer van Asymptote luistert naar de toets "h" om de camera
  // terug naar huis te sturen. Lukt dat niet, dan herladen we het frame.
  function herstelFiguur(frame) {
    var stap = frame._stappen && frame._stappen.aantal ? frame._stappen.stap : null;
    try {
      var doc = frame.contentDocument;
      if (doc && doc.readyState === "complete") {
        doc.dispatchEvent(new KeyboardEvent("keydown", { key: "h", bubbles: true }));
        if (stap) {
          frame.contentWindow.postMessage({ type: "asy-stap", stap: stap }, "*");
        }
        return;
      }
    } catch (e) {
      /* ander origin of nog niet geladen: hieronder herladen we gewoon. */
    }
    frame._herstelStap = stap;
    frame.removeAttribute("src");
    frame.setAttribute("src", frame.dataset.bron);
  }

  function herstelAlleFiguren() {
    var slide = slides[index];
    if (!slide) return;
    slide.querySelectorAll("iframe").forEach(function (frame) {
      if (!frame.hasAttribute("data-vast")) herstelFiguur(frame);
    });
    slide.dispatchEvent(new CustomEvent("pres:herstel", { bubbles: true }));
  }

  /* --- Navigatie -------------------------------------------------------- */

  function toon(nieuw, vanHash) {
    nieuw = Math.max(0, Math.min(slides.length - 1, nieuw));
    if (groteFiguur) zetGroteFiguur(groteFiguur, false);
    if (slides[index] && index !== nieuw) {
      slides[index].classList.remove("pres-actief");
      activeerFiguren(slides[index], false);
    }
    index = nieuw;
    var slide = slides[index];
    slide.classList.add("pres-actief");
    toonHintknop();
    activeerFiguren(slide, true);
    // Een grafiek die in de pagina zelf tekent, kon zolang haar slide
    // verborgen was niets meten. Dit signaal is haar startsein.
    slide.dispatchEvent(new CustomEvent("pres:zichtbaar", { bubbles: true }));
    podium.scrollTop = 0;

    knopVorige.disabled = index === 0;
    knopVolgende.disabled = index === slides.length - 1;
    teller.textContent = (index + 1) + " / " + slides.length;
    voortgang.style.width = ((index + 1) / slides.length * 100) + "%";
    voortgangbalk.setAttribute("aria-valuenow", String(index + 1));

    // Een slidewissel verandert de hele pagina zonder dat de focus verspringt;
    // een schermlezer hoort er anders niets van.
    melding.textContent = zonderWiskunde(slide.dataset.titel) +
      ", slide " + (index + 1) + " van " + slides.length;

    zijbalk.querySelectorAll("a[data-index]").forEach(function (a) {
      var actief = Number(a.dataset.index) === index;
      a.classList.toggle("pres-huidig", actief);
      if (actief) {
        var top = a.offsetTop - zijbalk.clientHeight / 2;
        if (Math.abs(zijbalk.scrollTop - top) > zijbalk.clientHeight / 2) {
          zijbalk.scrollTop = Math.max(0, top);
        }
      }
    });

    if (!vanHash) history.replaceState(null, "", "#" + slide.id);
    document.title = zonderWiskunde(slide.dataset.titel) + " · " + basisTitel;
    bewaar("slide", slide.id);
  }

  function naarHash(vanLaden) {
    var id = decodeURIComponent(location.hash.slice(1));
    if (!id) return false;
    var item = navigatie.find(function (n) { return n.id === id; });
    var i = item ? item.slideIndex : slides.findIndex(function (s) { return s.id === id; });
    if (i < 0) return false;
    toon(i, true);
    return true;
  }

  /* --- Overzichten op de kopslides -------------------------------------- */

  // Elke slide waar nog iets onder hangt (de titelslide, een deel, een
  // paragraaf) krijgt onderaan een lijstje van wat er rechtstreeks onder valt.
  // Dat geeft de klas de rode draad en is tegelijk een snelle ingang; de
  // volledige boom blijft in de zijbalk staan. Staat er al een inleidend
  // stukje tekst, dan komt het lijstje daaronder.
  function zetOverzichten() {
    slides.forEach(function (s, i) {
      var kinderen = kinderenVan(i);
      if (kinderen.length) s.appendChild(maakOverzicht(kinderen));
    });
  }

  // Wat er rechtstreeks onder een slide hangt: het eerstvolgende niveau, tot
  // een slide van hetzelfde of een hoger niveau de reeks afsluit. De
  // titelslide staat buiten die telling en krijgt de delen.
  function kinderenVan(i) {
    var uit = [];
    if (slides[i].dataset.titelslide) {
      navigatie.forEach(function (item, j) {
        if (item.slide !== slides[i] && item.niveau === 1) uit.push(j);
      });
      return uit;
    }
    var begin = navigatie.findIndex(function (item) { return item.slide === slides[i]; });
    var niveau = Number(slides[i].dataset.niveau);
    for (var j = begin + 1; j < navigatie.length; j++) {
      var n = navigatie[j].niveau;
      if (n <= niveau) break;
      if (n === niveau + 1) uit.push(j);
    }
    return uit;
  }

  function maakOverzicht(kinderen) {
    var lijst = el("ol", "pres-korteinhoud");
    kinderen.forEach(function (j) {
      var item = navigatie[j];
      var li = el("li");
      var a = el("a");
      // Ook zonder nummer blijft de kolom staan, zodat de titels van
      // genummerde en ongenummerde stukken op dezelfde lijn beginnen.
      a.appendChild(el("span", "pres-tocnummer", item.nummer || ""));
      // Zoals in de zijbalk een kopie van de kop, zodat wiskunde in een titel
      // straks door MathJax getypezet wordt.
      var kop = item.kop;
      var tekst = el("span");
      if (kop) {
        Array.prototype.forEach.call(kop.childNodes, function (n) {
          if (n.classList && n.classList.contains("sectionnumber")) return;
          tekst.appendChild(n.cloneNode(true));
        });
      } else {
        tekst.textContent = item.titel;
      }
      a.appendChild(tekst);
      a.href = "#" + item.id;
      a.addEventListener("click", function (e) {
        e.preventDefault();
        toon(item.slideIndex);
        history.replaceState(null, "", "#" + item.id);
      });
      li.appendChild(a);
      lijst.appendChild(li);
    });
    return lijst;
  }

  /* --- Zijbalk, zoeken en presentatiestand ------------------------------ */

  // Dezelfde grens als het smalle-schermenblok in presentatie.css: daar
  // zweeft de inhoudstafel over het podium in plaats van ernaast te staan.
  function smalScherm() {
    return window.matchMedia("(max-width: 55rem)").matches;
  }

  function wisselZijbalk(open) {
    var dicht = open === undefined
      ? !document.body.classList.contains("pres-zijbalk-dicht")
      : !open;
    document.body.classList.toggle("pres-zijbalk-dicht", dicht);
    knopZijbalk.setAttribute("aria-expanded", String(!dicht));
  }

  // De zoekterm dunt de inhoudstafel uit. De titels van de delen verdwijnen
  // dan mee: wat overblijft, is precies wat je zocht.
  function filterInhoud() {
    var term = zoekveld.value.trim().toLowerCase();
    zijbalk.querySelectorAll("li").forEach(function (li) {
      li.hidden = term !== "" && li.textContent.toLowerCase().indexOf(term) < 0;
    });
    zijbalk.classList.toggle("pres-zoekt", term !== "");
  }

  function naarZoek() {
    wisselZijbalk(true);
    zoekveld.focus();
    zoekveld.select();
  }

  // Geeft terug of er iets te wissen viel, zodat Escape verder kan gaan met
  // wat er nog openstaat.
  function wisZoek() {
    if (!zoekveld.value) return false;
    zoekveld.value = "";
    filterInhoud();
    return true;
  }

  // Voor het scherm vooraan in de klas: volledig scherm, alles een paar
  // punten groter, en de kopbalk en de inhoudstafel gaan weg zodat de cursus
  // zelf de plaats krijgt.
  // De voetbalk blijft, want daarmee blader je. De maat hangt aan <html>,
  // zodat de hele opmaak meeschaalt, want die rekent in rem.
  //
  // De stand wordt bewust niet onthouden: ze hoort bij de les die je aan het
  // geven bent, dus zet een herladen ze weer af.
  // Volledig scherm hoort bij de presentatiestand, maar mag ze nooit in de
  // weg zitten: weigert de browser (geen gebaar van de gebruiker, of een
  // instelling), dan werkt de stand gewoon zonder.
  function volledigScherm(aan) {
    var belofte = null;
    try {
      if (aan) {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
          belofte = document.documentElement.requestFullscreen();
        }
      } else if (document.fullscreenElement && document.exitFullscreen) {
        belofte = document.exitFullscreen();
      }
    } catch (e) { /* niets */ }
    if (belofte && belofte.catch) belofte.catch(function () { /* niets */ });
  }

  function zetPresentatiestand(aan) {
    var was = document.documentElement.classList.contains("pres-groot");
    document.documentElement.classList.toggle("pres-groot", aan);
    knopPresentatie.setAttribute("aria-pressed", String(aan));

    // De inhoudstafel gaat mee dicht, maar wie ze tijdens de les toch opent
    // (met i of /), houdt ze. Achteraf staat ze weer zoals ze stond.
    if (aan && !was) {
      zijbalkVoorPresentatie = document.body.classList.contains("pres-zijbalk-dicht");
      wisselZijbalk(false);
    } else if (!aan && was) {
      wisselZijbalk(!zijbalkVoorPresentatie);
      zijbalkVoorPresentatie = false;
      document.body.classList.remove("pres-kop-toon");
      if (groteFiguur) zetGroteFiguur(groteFiguur, false);
    }
    if (aan !== was) volledigScherm(aan);
  }

  /* --- Chroom rond het podium ------------------------------------------ */

  var basisTitel = document.title;

  function bouwChroom(stroom) {
    var kop = kopbalk = el("header", "pres-kop");

    knopZijbalk = el("button", "pres-knop");
    knopZijbalk.type = "button";
    knopZijbalk.title = "Inhoud tonen of verbergen (i)";
    knopZijbalk.setAttribute("aria-controls", "pres-zijbalk");
    knopZijbalk.setAttribute("aria-expanded", "true");
    knopZijbalk.appendChild(icoon(ICOON.lijst));
    knopZijbalk.addEventListener("click", function () { wisselZijbalk(); });
    kop.appendChild(knopZijbalk);

    var titel = el("h1");
    var hoofdstuk = document.querySelector(".cursustitel .cursushoofdstuk");
    if (hoofdstuk && hoofdstuk.textContent.trim()) {
      titel.appendChild(el("span", "pres-hoofdstuk", hoofdstuk.textContent.trim() + " ·"));
      titel.appendChild(document.createTextNode(" "));
    }
    titel.appendChild(document.createTextNode(basisTitel));
    kop.appendChild(titel);

    kop.appendChild(el("div", "pres-rek"));

    knopOplossingen = el("button", "pres-knop");
    knopOplossingen.type = "button";
    knopOplossingen.setAttribute("aria-pressed", "false");
    knopOplossingen.title = "Alle oplossingen tonen of verbergen (o)";
    knopOplossingen.appendChild(icoon(ICOON.oog));
    knopOplossingen.appendChild(el("span", "pres-verberg-smal", "Oplossingen"));
    knopOplossingen.addEventListener("click", function () {
      wisselAlleOplossingen(!oplossingenZichtbaar);
    });
    kop.appendChild(knopOplossingen);

    knopHints = el("button", "pres-knop");
    knopHints.type = "button";
    knopHints.appendChild(icoon(ICOON.lamp));
    knopHints.appendChild(el("span", "pres-verberg-smal"));
    knopHints.addEventListener("click", wisselHints);
    toonHintknop();
    kop.appendChild(knopHints);

    // Geen resetknop in de balk: elke figuur krijgt er zelf een naast zich,
    // en de sneltoets r blijft alles op deze slide herstellen.

    knopPresentatie = el("button", "pres-knop");
    knopPresentatie.type = "button";
    knopPresentatie.title = "Volledig scherm met grotere letters, voor de klas (p)";
    knopPresentatie.setAttribute("aria-pressed", "false");
    knopPresentatie.appendChild(icoon(ICOON.scherm));
    knopPresentatie.appendChild(el("span", "pres-verberg-smal", "Presentatie"));
    knopPresentatie.addEventListener("click", function () {
      zetPresentatiestand(!document.documentElement.classList.contains("pres-groot"));
    });
    kop.appendChild(knopPresentatie);

    knopThema = el("button", "pres-knop");
    knopThema.type = "button";
    knopThema.addEventListener("click", wisselThema);
    toonThemaknop(huidigThema());
    kop.appendChild(knopThema);

    var knopHulp = el("button", "pres-knop");
    knopHulp.type = "button";
    knopHulp.title = "Sneltoetsen (?)";
    knopHulp.appendChild(icoon(ICOON.vraag));
    knopHulp.addEventListener("click", function () { hulpvenster.toggleAttribute("open"); });
    kop.appendChild(knopHulp);

    sluier = el("div", "pres-sluier");
    sluier.addEventListener("click", function () { wisselZijbalk(false); });

    zijbalk = el("nav", "pres-zijbalk");
    zijbalk.id = "pres-zijbalk";
    zijbalk.setAttribute("aria-label", "Inhoud");

    // Een lange inhoudstafel doorscrollen terwijl de klas staat te kijken,
    // duurt te lang; dit veld dunt de lijst uit terwijl je typt.
    var zoekdoos = el("div", "pres-zoek");
    zoekdoos.appendChild(icoon(ICOON.zoek));
    zoekveld = el("input");
    zoekveld.type = "search";
    zoekveld.placeholder = "Zoeken (/)";
    zoekveld.setAttribute("aria-label", "Zoeken in de inhoudstafel");
    zoekveld.addEventListener("input", filterInhoud);
    zoekveld.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        var eerste = zijbalk.querySelector("li:not([hidden]) > a");
        if (eerste) { toon(Number(eerste.dataset.index)); zoekveld.blur(); }
      } else if (e.key === "Escape") {
        e.preventDefault();
        wisZoek();
        zoekveld.blur();
      }
    });
    zoekdoos.appendChild(zoekveld);
    zijbalk.appendChild(zoekdoos);

    var lijst = el("ol");
    navigatie.forEach(function (item) {
      var s = item.slide;
      var i = item.slideIndex;
      var li = el("li", "pres-niveau-" + item.niveau);
      var a = el("a");
      // Ook zonder nummer blijft de kolom staan, zodat titels van hetzelfde
      // niveau steeds op dezelfde plaats beginnen. De cursustitel zelf heeft
      // geen nummerkolom nodig.
      if (!s.dataset.titelslide) {
        a.appendChild(el("span", "pres-tocnummer", item.nummer || ""));
      }
      // Een kopie van de kop, niet enkel de tekst: staat er wiskunde in de
      // titel, dan typezet MathJax die straks ook hier.
      var kop = item.kop;
      var tekst = el("span", "pres-toctitel");
      if (kop) {
        Array.prototype.forEach.call(kop.childNodes, function (n) {
          if (n.classList && n.classList.contains("sectionnumber")) return;
          tekst.appendChild(n.cloneNode(true));
        });
      } else {
        tekst.textContent = item.titel;
      }
      a.appendChild(tekst);
      a.href = "#" + item.id;
      a.dataset.index = String(i);
      a.addEventListener("click", function (e) {
        e.preventDefault();
        toon(i);
        history.replaceState(null, "", "#" + item.id);
        // Op een telefoon ligt de lijst over de cursus; wie gekozen heeft,
        // wil die slide zien en niet de lijst.
        if (smalScherm()) wisselZijbalk(false);
      });
      li.appendChild(a);
      lijst.appendChild(li);
    });
    zijbalk.appendChild(lijst);

    podium = el("div", "pres-podium");
    podium.appendChild(stroom);

    var voet = el("footer", "pres-voet");
    knopVorige = el("button", "pres-knop");
    knopVorige.type = "button";
    knopVorige.appendChild(icoon(ICOON.links));
    knopVorige.appendChild(el("span", "pres-verberg-smal", "Vorige"));
    knopVorige.addEventListener("click", function () { toon(index - 1); });

    knopVolgende = el("button", "pres-knop");
    knopVolgende.type = "button";
    knopVolgende.appendChild(el("span", "pres-verberg-smal", "Volgende"));
    knopVolgende.appendChild(icoon(ICOON.rechts));
    knopVolgende.addEventListener("click", function () { toon(index + 1); });

    teller = el("span", "pres-teller");

    // De balk toont niet alleen hoever we staan, je kan er ook op springen.
    var balk = voortgangbalk = el("div", "pres-voortgang");
    balk.title = "Klik om naar een plaats in het hoofdstuk te springen";
    balk.setAttribute("role", "progressbar");
    balk.setAttribute("aria-label", "Voortgang");
    balk.setAttribute("aria-valuemin", "1");
    balk.setAttribute("aria-valuemax", String(slides.length));
    var rail = el("div", "pres-rail");
    voortgang = el("div");
    rail.appendChild(voortgang);
    balk.appendChild(rail);
    balk.addEventListener("click", function (e) {
      var kader = rail.getBoundingClientRect();
      var deel = (e.clientX - kader.left) / kader.width;
      toon(Math.floor(deel * slides.length));
    });

    // In presentatiestand is de kopbalk weg; dit is dan de weg terug voor
    // wie liever klikt dan Escape drukt.
    var knopUit = el("button", "pres-knop pres-uit");
    knopUit.type = "button";
    knopUit.title = "Presentatiestand verlaten (Escape)";
    knopUit.appendChild(icoon(ICOON.scherm));
    knopUit.appendChild(el("span", "pres-verberg-smal", "Presentatie sluiten"));
    knopUit.addEventListener("click", function () { zetPresentatiestand(false); });

    voet.appendChild(knopVorige);
    voet.appendChild(teller);
    voet.appendChild(balk);
    voet.appendChild(knopUit);
    voet.appendChild(knopVolgende);

    hulpvenster = el("div", "pres-hulp");
    var kader = el("div");
    kader.appendChild(el("h2", null, "Sneltoetsen"));
    var dl = el("dl");
    [
      ["→ · spatie", "volgende slide"],
      ["←", "vorige slide"],
      ["↓ · Page Down", "volgende figuurstap, oplossing of slide"],
      ["↑ · Page Up", "vorige figuurstap, oplossing of slide"],
      ["Home · End", "eerste of laatste slide"],
      ["o", "alle oplossingen tonen of verbergen"],
      ["r", "figuren van deze slide resetten"],
      ["i", "inhoudstafel tonen of verbergen"],
      ["d", "dag- of nachtstand"],
      ["/", "zoeken in de inhoudstafel"],
      ["p", "presentatiestand: volledig scherm, grotere letters"],
      ["Escape", "sluit dit venster, een grote figuur, het zoekveld of de presentatiestand"],
      ["?", "dit venster"]
    ].forEach(function (rij) {
      var dt = el("dt");
      rij[0].split(" · ").forEach(function (toets, i) {
        if (i) dt.appendChild(document.createTextNode(" "));
        dt.appendChild(el("kbd", null, toets));
      });
      dl.appendChild(dt);
      dl.appendChild(el("dd", null, rij[1]));
    });
    kader.appendChild(dl);
    kader.appendChild(el("p", null,
      "Met de muis in een 3D-figuur: slepen draait, scrollen zoomt, " +
      "rechts slepen verschuift, h zet ze terug."));
    kader.appendChild(el("p", null,
      "Op een tablet: een vinger draait, twee vingers knijpen zoomt, " +
      "even blijven drukken en dan slepen verschuift."));
    hulpvenster.appendChild(kader);
    hulpvenster.addEventListener("click", function (e) {
      if (e.target === hulpvenster) hulpvenster.removeAttribute("open");
    });

    // Een slidewissel verplaatst de focus niet, dus krijgt een schermlezer
    // enkel iets te horen via dit vakje.
    melding = el("p", "pres-melding");
    melding.setAttribute("role", "status");
    melding.setAttribute("aria-live", "polite");

    // Chrome laat de focus na een muisklik op de knop staan. In
    // presentatiestand zou de kopbalk daardoor in beeld blijven tot je ergens
    // anders klikt, dus geven we ze na een echte klik weer vrij. Een klik met
    // het toetsenbord (Enter of spatie) heeft detail 0 en houdt de focus.
    kop.addEventListener("click", function (e) {
      var knop = e.target.closest ? e.target.closest(".pres-knop") : null;
      if (knop && e.detail > 0) knop.blur();
    });

    document.body.appendChild(melding);
    document.body.appendChild(kop);
    document.body.appendChild(sluier);
    document.body.appendChild(zijbalk);
    document.body.appendChild(podium);
    document.body.appendChild(voet);
    document.body.appendChild(hulpvenster);
  }

  /* --- Toetsen en gebaren ---------------------------------------------- */

  function bindToetsen() {
    document.addEventListener("keydown", function (e) {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      var doel = e.target;
      if (doel && (doel.tagName === "INPUT" || doel.tagName === "TEXTAREA")) return;

      // Staat de focus in een interactieve grafiek, dan horen de pijltjes bij
      // het punt of de knop daarbinnen, niet bij het bladeren. De overige
      // sneltoetsen blijven wel gewoon werken.
      if (doel && doel.closest && doel.closest(".interactieve-grafiek") &&
          ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", " ",
           "PageUp", "PageDown", "Home", "End"].indexOf(e.key) >= 0) {
        return;
      }

      switch (e.key) {
        case "ArrowRight": case " ":
          toon(index + 1); break;
        case "ArrowLeft":
          toon(index - 1); break;
        case "ArrowDown": case "PageDown": stapVooruit(); break;
        case "ArrowUp": case "PageUp": stapTerug(); break;
        case "Home": toon(0); break;
        case "End": toon(slides.length - 1); break;
        case "o": case "O": wisselAlleOplossingen(!oplossingenZichtbaar); break;
        case "r": case "R": herstelAlleFiguren(); break;
        case "i": case "I": wisselZijbalk(); break;
        case "d": case "D": wisselThema(); break;
        case "p": case "P":
          zetPresentatiestand(!document.documentElement.classList.contains("pres-groot"));
          break;
        case "/": naarZoek(); break;
        case "?": hulpvenster.toggleAttribute("open"); break;
        // Escape ruimt op wat er openstaat, van het bovenste naar het
        // onderste laagje, en zet je uiteindelijk uit de presentatiestand.
        case "Escape":
          if (hulpvenster.hasAttribute("open")) hulpvenster.removeAttribute("open");
          else if (groteFiguur) zetGroteFiguur(groteFiguur, false);
          else if (!wisZoek()) zetPresentatiestand(false);
          break;
        default: return;
      }
      e.preventDefault();
    });

    // Vegen op een tablet. Binnen een figuur niet, daar draait het gebaar de
    // 3D-scene; die zit toch in een iframe en vangt zijn eigen aanrakingen.
    var startX = null, startY = null;
    podium.addEventListener("touchstart", function (e) {
      if (e.touches.length !== 1) { startX = null; return; }
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });
    podium.addEventListener("touchend", function (e) {
      if (startX === null) return;
      var dx = e.changedTouches[0].clientX - startX;
      var dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        toon(index + (dx < 0 ? 1 : -1));
      }
      startX = null;
    }, { passive: true });

    window.addEventListener("hashchange", function () { naarHash(false); });

    // In volledig scherm neemt de browser Escape zelf af: de pagina ziet die
    // toets niet, ze krijgt enkel te horen dat het scherm weer gewoon is. Dan
    // stappen we ook uit de presentatiestand, zodat de twee gelijk lopen.
    document.addEventListener("fullscreenchange", function () {
      if (!document.fullscreenElement &&
          document.documentElement.classList.contains("pres-groot")) {
        zetPresentatiestand(false);
      }
    });

    // In presentatiestand ligt de kopbalk boven het scherm te wachten. Ga je
    // met de muis naar de bovenrand, dan schuift ze doorschijnend in beeld;
    // ze blijft staan zolang de muis erop of erbij is.
    document.addEventListener("mousemove", function (e) {
      if (!document.documentElement.classList.contains("pres-groot")) return;
      var toont = document.body.classList.contains("pres-kop-toon");
      var rand = toont ? kopbalk.offsetHeight : 6;
      document.body.classList.toggle("pres-kop-toon", e.clientY <= rand);
    });
  }

  /* --- Starten ---------------------------------------------------------- */

  function start() {
    var stroom = vindStroom();
    if (!stroom) return;

    maakSlides(stroom);
    if (!slides.length) return;
    zetKruimels();
    bereidOplossingenVoor();
    volgWiskundeOplossingen();
    bereidFigurenVoor();
    bereidGrafiekenVoor();
    bouwChroom(stroom);
    zetOverzichten();
    bindToetsen();

    document.body.classList.add("pres-klaar");
    zetPresentatiestand(false);
    // Breed staat de inhoudstafel naast het podium en hoort ze open; smal
    // ligt ze eroverheen, en dan is de cursus zelf het eerste wat je wil zien.
    wisselZijbalk(!smalScherm());
    wisselAlleOplossingen(opgehaald("oplossingen") === "1");

    // Een anker in de adresbalk wint altijd: dat is een link naar een
    // welbepaalde stelling. Anders pikken we op waar deze browser gebleven was.
    if (!naarHash(true)) {
      var vorige = opgehaald("slide");
      var i = vorige ? slides.findIndex(function (s) { return s.id === vorige; }) : -1;
      toon(i < 0 ? 0 : i);
    }
  }

  // Meteen starten, niet wachten op DOMContentLoaded. Het script staat
  // onderaan de body, dus de cursus is al ingelezen, en MathJax hangt zijn
  // typezetbeurt aan DOMContentLoaded. Wachten zou ons dus na MathJax laten
  // draaien, waardoor de slidenamen van gerenderde formules zouden afhangen
  // in plaats van van de brontekst.
  start();
})();
