package be.mjodheim.brewstead.service;

import be.mjodheim.brewstead.dto.account.ApparenceRequest;
import be.mjodheim.brewstead.entity.Apparence;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.*;

class ApparenceCatalogueTest {

    @Test
    void aValidChoiceIsKeptAndNormalized() {
        Apparence a = ApparenceCatalogue.valider(new ApparenceRequest(
                "Grand", " brune ", "tresse", "roux", "tressee", "guerrier", "fjord"));
        assertEquals("grand", a.getCorps());
        assertEquals("brune", a.getPeau());
        assertEquals("tressee", a.getBarbe());
        assertEquals("fjord", a.getCouleur());
    }

    @Test
    void anUnknownOrMissingChoiceIsRefused() {
        assertThrows(IllegalArgumentException.class, () -> ApparenceCatalogue.valider(new ApparenceRequest(
                "robuste", "verte", "court", "roux", "aucune", "brasseur", "ambre")));
        assertThrows(IllegalArgumentException.class, () -> ApparenceCatalogue.valider(new ApparenceRequest(
                "robuste", "claire", null, "roux", "aucune", "brasseur", "ambre")));
        assertThrows(IllegalArgumentException.class, () -> ApparenceCatalogue.valider(null));
    }

    @Test
    void theDefaultLookIsStableAndAlwaysDrawable() {
        for (long id = 0; id < 400; id++) {
            Apparence a = ApparenceCatalogue.parDefaut(id);
            Apparence again = ApparenceCatalogue.parDefaut(id);
            assertEquals(a.getCorps(), again.getCorps());
            assertEquals(a.getPeau(), again.getPeau());
            assertDoesNotThrow(() -> ApparenceCatalogue.valider(new ApparenceRequest(a.getCorps(), a.getPeau(),
                    a.getCheveux(), a.getTeinte(), a.getBarbe(), a.getTenue(), a.getCouleur())), "id " + id);
        }
    }

    /** Le dessin et le serveur doivent proposer exactement les mêmes choix. */
    @Test
    void theDrawingOffersExactlyTheServerChoices() throws IOException {
        String js = Files.readString(Path.of("src/main/resources/static/js/brewstead-personnage.js"));
        String bloc = js.substring(js.indexOf("var CATALOGUE = {"), js.indexOf("};", js.indexOf("var CATALOGUE = {")));
        ApparenceCatalogue.OPTIONS.forEach((groupe, attendues) -> {
            Matcher m = Pattern.compile(groupe + ":\\s*\\[(.*?)\\]\\s*(,\\s*\\n\\s*\\w+:|$)", Pattern.DOTALL).matcher(bloc);
            assertTrue(m.find(), "groupe absent du dessin : " + groupe);
            List<String> trouvees = new ArrayList<>();
            Matcher cle = Pattern.compile("\\['([a-z]+)',").matcher(m.group(1));
            while (cle.find()) trouvees.add(cle.group(1));
            assertEquals(attendues, trouvees, groupe);
        });
    }
}
