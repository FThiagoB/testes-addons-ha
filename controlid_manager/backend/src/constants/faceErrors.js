const FACE_ERROR_MESSAGES = {
  1: 'Parâmetros inválidos ou formato de imagem não reconhecido (use JPG ou PNG).',
  2: 'Nenhum rosto foi identificado na imagem enviada.',
  3: 'Este rosto já está cadastrado para outro usuário.',
  4: 'Rosto muito descentralizado na imagem.',
  5: 'Rosto muito pequeno / distante da câmera.',
  6: 'Rosto muito grande / próximo demais da câmera.',
  7: 'Rosto inclinado ou mal posicionado em relação à câmera.',
  8: 'Nitidez insuficiente na imagem para reconhecimento facial.',
  9: 'Rosto muito próximo das bordas da imagem.',
};

function enrichFaceErrors(errors = []) {
  return errors.map((err) => {
    let friendlyMessage =
      FACE_ERROR_MESSAGES[err.code] || err.message || 'Erro ao validar face.';
    if (err.code === 3 && err.info?.match_user_id) {
      friendlyMessage = `Este rosto já pertence ao usuário ID ${err.info.match_user_id}.`;
    }
    return { ...err, friendlyMessage };
  });
}

module.exports = { FACE_ERROR_MESSAGES, enrichFaceErrors };