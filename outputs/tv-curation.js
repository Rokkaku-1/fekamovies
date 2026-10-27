/* Selección editorial por ID de iptv-org; no es un ranking de audiencia. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FekaTVCuration = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  // Orden de preferencia. Los candidatos sin señal compatible no se muestran.
  const countries = {
    PE: ['AmericaTelevision.pe', 'Latina.pe', 'ATV.pe', 'PanamericanaTV.pe', 'TVPeru.pe', 'GlobalTV.pe', 'RPPTV.pe', 'WillaxTV.pe', 'ATVPlus.pe', 'ExitosaTV.pe', 'PBO.pe', 'Nativa.pe', 'LaTele.pe', 'TVPeruNoticias.pe', 'SolTV.pe', 'ATVSur.pe'],
    CO: ['CaracolTV.co', 'CanalRCN.co', 'Canal1.co', 'SenalColombia.co', 'NTN24.co', 'NoticiasRCN.co', 'RedPlus.co', 'NuestraTeleInternacional.co', 'RCNNovelas.co', 'RCNMas.co', 'CanalInstitucional.co', 'Teleantioquia.co', 'Telecaribe.co', 'Telepacifico.co', 'CanalCapital.co', 'CitytvBogota.co'],
    AR: ['Telefe.ar', 'ElTrece.ar', 'AmericaTV.ar', 'TelevisionPublica.ar', 'TN.ar', 'TyCSports.ar', 'Canal26.ar', 'ElNueve.ar', 'A24.ar', 'C5N.ar', 'NETTV.ar', 'ElGourmet.ar', 'EuropaEuropa.ar', 'ArgentinisimaSatelital.ar', 'CanalShowsport.ar'],
    CL: ['Mega.cl', 'ChileVision.cl', 'Canal13.cl', 'TVN.cl', 'LaRed.cl', '24Horas.cl', 'T13EnVivo.cl', '13C.cl', 'TVPlus.cl', 'Telecanal.cl', 'UCVTV.cl', 'BioBioTV.cl'],
    EC: ['Ecuavisa.ec', 'Teleamazonas.ec', 'TCTelevision.ec', 'Gamavision.ec', 'EcuadorTV.ec', 'RTS.ec', 'TVC.ec', 'OromarTV.ec', 'Telerama.ec', 'RTU.ec'],
    UY: ['Canal10.uy', 'Teledoce.uy', 'Canal4.uy', 'Canal5.uy', 'TVCiudad.uy', 'UCL.uy'],
    PY: ['Telefuturo.py', 'SNT.py', 'Trece.py', 'Unicanal.py', 'ParaguayTV.py', 'ABCTVParaguay.py', 'C9N.py', 'TigoSportsPlus.py', 'Nanduti.py', 'VenusMedia.py'],
    BO: ['Unitel.bo', 'RedUno.bo', 'ATB.bo', 'BoliviaTV.bo', 'PAT.bo', 'Bolivision.bo', 'RTP.bo', 'CadenaA.bo', 'Gigavision.bo', 'ELDEBER.bo'],
    VE: ['Venevision.ve', 'Televen.ve', 'Globovision.ve', 'VenezolanadeTelevision.ve', 'Telesur.ve', 'TVes.ve', 'ValeTV.ve', 'VenevisionInternacional.ve', 'MeridianoTV.ve'],
    MX: ['LasEstrellas.mx', 'AztecaUno.mx', 'Azteca7.mx', 'Canal5.mx', 'ImagenTV.mx', 'CanalOnce.mx', 'ADN40.mx', 'Foro.mx', 'NPlusForo.mx', 'MilenioTelevision.mx', 'MultimediosMonterrey.mx', 'TeleFormula.mx', 'Canal22MetropolitanayNacional.mx', 'CanaldelCongreso451.mx', 'AztecaInternacional.mx'],
    ES: ['La1.es', 'Antena3.es', 'Telecinco.es', 'LaSexta.es', 'La2.es', 'Teledeporte.es', 'Clan.es'],
    CR: ['Teletica7.cr', 'Canal6.cr', 'Canal4.cr', 'TreceCostaRicaTelevision.cr', 'Canal11.cr', 'Canal2.cr', 'ExtraTV42.cr', 'Canal8.cr', 'QuinceUCR.cr'],
    PA: ['TVN.pa', 'Telemetro.pa', 'RPCTV.pa', 'SerTV.pa', 'TVMax.pa', 'NexTVCanal21.pa', 'Mas23TV.pa'],
    GT: ['Canal3.gt', 'Canal7.gt', 'Guatevision.gt', 'Canal11.gt', 'TN23.gt', 'Canal27.gt', 'TVMaya.gt'],
    HN: ['HCH.hn', 'Canal5ElLider.hn', 'Canal11.hn', 'TSi.hn', 'TENCanal10.hn', 'VTV.hn', 'AztecaHonduras.hn', 'DeportesTVC.hn', 'GloboTV.hn', 'UNETV.hn'],
    SV: ['Canal2.sv', 'Canal4.sv', 'Canal6.sv', 'Canal12.sv', 'Canal10.sv', 'MegavisionCanal19.sv', 'MegavisionCanal21.sv', 'Canal11TuTV.sv', 'TVOCanal23.sv'],
    NI: ['Canal10.ni', 'Canal2.ni', 'Canal6.ni', 'TN8.ni', 'VivaNicaraguaCanal13.ni', 'CDNN23.ni', 'Canal15.ni'],
    DO: ['Telemicro.do', 'ColorVision.do', 'Telesistema11.do', 'Antena7.do', 'CDN.do', 'TeleAntillas.do', 'Telecentro.do', 'Digital15.do', 'CDNDeportes.do', 'Teleuniverso.do', 'SuperCanal.do', 'Canal4RD.do', 'RNN.do'],
    CU: ['Cubavision.cu', 'CubavisionInternacional.cu', 'TeleRebelde.cu', 'CanalCaribe.cu'],
    PR: ['WAPATV41.pr', 'WKAQTV22.pr', 'WIPRTV61.pr', 'TeleOnce.pr', 'AmericaTeVe.pr'],
    BR: ['TVGloboSaoPaulo.br', 'Record.br', 'SBTNacional.br', 'Band.br', 'TVCultura.br', 'RedeTV.br', 'TVBrasil.br', 'CNNBrasil.br', 'RecordNews.br', 'BandNews.br', 'JovemPanNews.br', 'TVGazeta.br'],
    IT: ['Rai1.it', 'Canale5.it', 'Rai2.it', 'Rai3.it', 'Italia1.it', 'RaiNews24.it', 'Sportitalia.it'],
    US: ['Telemundo.us', 'Univision.us', 'ABCNewsLive.us', 'NBCNewsNOW.us', 'CBSNews247.us', 'CNNInternational.us'],
    FR: ['TF1.fr', 'France2.fr', 'M6.fr', 'France3.fr', 'France5.fr', 'BFMTV.fr', 'France24.fr'],
    DE: ['DasErste.de', 'ZDF.de', 'RTL.de', 'DW.de'],
    UK: ['BBCOne.uk', 'ITV1.uk', 'BBCNews.uk', 'SkyNews.uk'],
    PT: ['RTP1.pt', 'SIC.pt', 'TVI.pt', 'RTP2.pt', 'RTPMundo.pt'],
    CA: ['CBCNewsNetwork.ca', 'CTV.ca', 'IciRadioCanadaTele.ca', 'CTVNewsChannel.ca'],
    JP: ['NHKGeneralTV.jp', 'NHKWorldPremium.jp', 'NHKWorldJapan.jp'],
    KR: ['KBS1TV.kr', 'MBCTV.kr', 'SBS.kr', 'YTN.kr', 'ArirangTV.kr'],
    CN: ['CCTV1.cn', 'CCTV4Asia.cn', 'CGTN.cn'],
    IN: ['DDNational.in', 'DDNews.in', 'NDTV24x7.in', 'IndiaToday.in'],
    AU: ['ABCTV.au', 'ABCNews.au', 'SBS.au'],
  };
  for (const ids of Object.values(countries)) Object.freeze(ids);
  Object.freeze(countries);
  const spanishCountries = new Set(['PE', 'CO', 'AR', 'CL', 'EC', 'UY', 'PY', 'BO', 'VE', 'MX', 'ES', 'CR', 'PA', 'GT', 'HN', 'SV', 'NI', 'DO', 'CU', 'PR']);
  const latinAmerica = new Set([...spanishCountries].filter(code => code !== 'ES').concat('BR'));
  // América TV se añade sin desplazar ninguno de los doce canales peruanos existentes.
  const limitForCountry = country => country === 'PE' ? 13 : latinAmerica.has(country) ? 12 : 5;
  const officialPages = Object.freeze({
    'AmericaTelevision.pe': Object.freeze({name: 'América TV', url: 'https://tvgo.americatv.com.pe/', languages: Object.freeze(['spa'])}),
  });
  const nativeLanguages = { BR: ['por'], IT: ['ita'], US: ['eng', 'spa'], FR: ['fra'], DE: ['deu'], UK: ['eng'], PT: ['por'], CA: ['eng', 'fra'], JP: ['jpn'], KR: ['kor'], CN: ['zho'], IN: ['hin', 'eng'], AU: ['eng'] };
  function rank(channel) {
    if (!channel || channel.is_nsfw || channel.closed || channel.replaced_by) return -1;
    return countries[channel.country]?.indexOf(channel.id) ?? -1;
  }
  function acceptsFeed(country, feed) {
    return !spanishCountries.has(country) || feed?.languages?.includes('spa');
  }
  function languageRank(country, languages = []) {
    const preferred = spanishCountries.has(country) ? ['spa'] : nativeLanguages[country] || [];
    return languages.some(language => preferred.includes(language)) ? 0 : 1;
  }
  return Object.freeze({ countries, officialPages, limitForCountry, rank, acceptsFeed, languageRank });
});
